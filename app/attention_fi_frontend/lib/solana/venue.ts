import { BN, type Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { fetchPool, poolPda, poolSpotSol, swapQuote, type PoolState } from "./amm";
import {
  LAMPORTS_PER_SOL,
  fetchCurve,
  quoteBuy,
  quoteSell,
  spotPriceSol,
  type CurveState,
} from "./curve";
import { ata, curvePda, globalPda } from "./program";

/**
 * Where a token actually trades right now.
 *
 * A token's venue changes exactly once in its life, and the changeover is not
 * atomic: `buy`/`sell` start refusing the moment the curve completes, but the
 * pool doesn't exist until someone calls `graduate`. Between those two moments
 * the token trades nowhere. That gap is a real state a real token sat in with
 * 95 SOL locked inside it, so it gets its own variant rather than being folded
 * into "curve" and mispriced, or into "pool" and quoted against reserves that
 * aren't there.
 */
export type Venue =
  | { kind: "curve"; curve: CurveState; pool: null }
  /** Complete, but not yet migrated — nothing can trade until `graduate` runs. */
  | { kind: "stranded"; curve: CurveState; pool: null }
  | { kind: "pool"; curve: CurveState | null; pool: PoolState };

/**
 * Which venue prices and executes trades for this mint.
 *
 * Pool existence decides, not `curve.complete`: `complete` is set the instant
 * the threshold is crossed, which is strictly earlier than the token being
 * tradeable again.
 */
export async function resolveVenue(
  program: Program<AttentionFi>,
  mint: PublicKey,
): Promise<Venue | null> {
  const [curve, pool] = await Promise.all([fetchCurve(program, mint), fetchPool(program, mint)]);
  if (pool) return { kind: "pool", curve, pool };
  if (!curve) return null;
  return curve.complete
    ? { kind: "stranded", curve, pool: null }
    : { kind: "curve", curve, pool: null };
}

/** Spot price in SOL per whole token, from whichever venue is live. */
export function venueSpot(venue: Venue, decimals: number): number {
  if (venue.kind === "pool") return poolSpotSol(venue.pool, decimals);
  // A stranded curve's real reserves are zero but its *virtual* ones aren't, so
  // spot still reads correctly — it's the last price the curve traded at, which
  // is also what the pool will open at once migration runs.
  return spotPriceSol(venue.curve, decimals);
}

/**
 * What a trade actually returns, net of fees: whole tokens out for a buy, SOL
 * out for a sell.
 *
 * `amount` is denominated in what's being spent — SOL for a buy, whole tokens
 * for a sell — matching what the order ticket asks for.
 *
 * The fee handling mirrors each venue's own, and the two differ. The curve
 * skims from the SOL *in* on a buy and from the SOL *out* on a sell; the AMM
 * always skims from the input. `quoteBuy`/`quoteSell` in ./curve are gross of
 * fees, so applying the fee here is not a refinement — a gross figure is both
 * the wrong number to display and, once it becomes the slippage floor, a floor
 * the chain can't clear. At a 1% fee and 1% tolerance a gross curve buy sits
 * exactly on the boundary and fails or succeeds on rounding; tighten the
 * tolerance to 0.5% and every curve buy fails.
 */
export function venueQuote(
  venue: Venue,
  side: "buy" | "sell",
  amount: number,
  decimals: number,
  feeBps: number,
): number {
  if (amount <= 0) return 0;
  if (venue.kind === "stranded") return 0;
  const netOfFee = 1 - feeBps / 10_000;

  if (venue.kind === "pool") {
    const { solReserves, tokenReserves } = venue.pool;
    if (side === "buy") {
      const lamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));
      return Number(swapQuote(solReserves, tokenReserves, lamports, feeBps)) / 10 ** decimals;
    }
    const base = BigInt(Math.floor(amount * 10 ** decimals));
    return Number(swapQuote(tokenReserves, solReserves, base, feeBps)) / LAMPORTS_PER_SOL;
  }

  // Curve: fee off the input before pricing a buy, off the proceeds after
  // pricing a sell — the order the program uses in `buy_quote`/`sell_quote`.
  return side === "buy"
    ? quoteBuy(venue.curve, amount * netOfFee) / 10 ** decimals
    : quoteSell(venue.curve, amount * 10 ** decimals) * netOfFee;
}

/**
 * Execute a trade on whichever venue is live, with slippage protection.
 *
 * Routing lives here rather than in the callers so a screen cannot end up
 * quoting one venue and submitting to the other. The venue is re-resolved at
 * submit time: a token can graduate between the quote poll and the click, and
 * sending `buy` to a completed curve fails with `CurveComplete` — accurate, but
 * indistinguishable to the trader from the app being broken.
 */
export async function tradeOnVenue(
  program: Program<AttentionFi>,
  trader: PublicKey,
  mint: PublicKey,
  side: "buy" | "sell",
  amount: number,
  decimals: number,
  slippageBps = 100,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const venue = await resolveVenue(program, mint);
  if (!venue) throw new Error("This token isn't live on-chain yet.");
  if (venue.kind === "stranded") {
    throw new Error(
      "This token has graduated but its pool hasn't been created yet. Run graduation first — anyone can.",
    );
  }

  const feeBps = global.feeBps;
  const expected = venueQuote(venue, side, amount, decimals, feeBps);
  const minOutFraction = 1 - slippageBps / 10_000;

  if (venue.kind === "pool") {
    const amountIn =
      side === "buy"
        ? BigInt(Math.floor(amount * LAMPORTS_PER_SOL))
        : BigInt(Math.floor(amount * 10 ** decimals));
    const minOut =
      side === "buy"
        ? BigInt(Math.floor(expected * minOutFraction * 10 ** decimals))
        : BigInt(Math.floor(expected * minOutFraction * LAMPORTS_PER_SOL));
    return swapOnPoolTx(program, trader, mint, amountIn, minOut, side === "buy");
  }

  const curveKey = curvePda(mint);
  if (side === "buy") {
    const lamports = new BN(Math.floor(amount * LAMPORTS_PER_SOL));
    const minOut = new BN(Math.max(0, Math.floor(expected * minOutFraction * 10 ** decimals)));
    return program.methods
      .buy(lamports, minOut)
      .accountsPartial({
        buyer: trader,
        treasury: global.treasury,
        curve: curveKey,
        mint,
        vault: ata(curveKey, mint),
        buyerTokenAccount: ata(trader, mint),
        perk: null,
      })
      .rpc();
  }

  const raw = new BN(Math.floor(amount * 10 ** decimals));
  const minSol = new BN(Math.max(0, Math.floor(expected * minOutFraction * LAMPORTS_PER_SOL)));
  return program.methods
    .sell(raw, minSol)
    .accountsPartial({
      seller: trader,
      treasury: global.treasury,
      curve: curveKey,
      mint,
      vault: ata(curveKey, mint),
      sellerTokenAccount: ata(trader, mint),
      perk: null,
    })
    .rpc();
}

/** Raw `swap` call. Split out so `tradeOnVenue` reads as routing, not plumbing. */
function swapOnPoolTx(
  program: Program<AttentionFi>,
  trader: PublicKey,
  mint: PublicKey,
  amountIn: bigint,
  minAmountOut: bigint,
  isBuy: boolean,
): Promise<string> {
  const pool = poolPda(mint);
  return program.methods
    .swap(new BN(amountIn.toString()), new BN(minAmountOut.toString()), isBuy)
    .accountsPartial({
      trader,
      pool,
      mint,
      poolVault: ata(pool, mint),
      traderTokenAccount: ata(trader, mint),
      // Optional on-chain; null means "no discount" rather than a failure, so a
      // wallet without a perk still trades.
      perk: null,
    })
    .rpc();
}

/**
 * Create the AMM pool for a completed curve.
 *
 * Permissionless by design, and the UI exposes it that way: the curve stops
 * trading the moment it completes, so making the token wait on its creator to
 * appear would strand every holder in the meantime. Once-only — the pool PDA is
 * `init`, so a second call fails rather than double-migrating.
 */
export async function graduateToken(
  program: Program<AttentionFi>,
  payer: PublicKey,
  mint: PublicKey,
): Promise<string> {
  const curveKey = curvePda(mint);
  return program.methods
    .graduate()
    .accountsPartial({
      payer,
      curve: curveKey,
      mint,
      curveVault: ata(curveKey, mint),
      pool: poolPda(mint),
      poolVault: ata(poolPda(mint), mint),
    })
    .rpc();
}

/** Convenience for callers that hold a base58 mint. */
export function toMint(mint: string): PublicKey {
  return new PublicKey(mint);
}
