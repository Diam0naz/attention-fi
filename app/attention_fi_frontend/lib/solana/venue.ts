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
import { ata, curvePda, genesisPoolPda, globalPda } from "./program";

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
 * Whether a token's genesis fee pool exists.
 *
 * The trading instructions take it as an optional account: present, a slice of
 * each creator fee is routed to genesis NFT holders; absent, the creator keeps
 * their whole cut. It must not be supplied speculatively — passing an address
 * for an account that was never created fails the entire trade, and most tokens
 * never mint a genesis NFT.
 *
 * Cached per mint because it is a one-way fact. A pool is created with the
 * token's first genesis NFT and never removed, so a positive answer can never
 * become negative and is worth remembering; a negative one is re-checked, since
 * that is the answer that can change.
 */
const genesisPoolSeen = new Set<string>();

async function findGenesisPool(
  program: Program<AttentionFi>,
  mint: PublicKey,
): Promise<PublicKey | null> {
  const pda = genesisPoolPda(mint);
  if (genesisPoolSeen.has(pda.toBase58())) return pda;
  try {
    await program.account.genesisPool.fetch(pda);
    genesisPoolSeen.add(pda.toBase58());
    return pda;
  } catch {
    return null;
  }
}

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
 * Both venues now handle fees identically: off the SOL going in on a buy, off
 * the SOL coming out on a sell. That symmetry matters here because it is easy
 * to write the sell side the way constant-product suggests — skimming the token
 * input — and get a number the chain will not honour.
 *
 * `quoteBuy`/`quoteSell` in ./curve are gross of fees, so applying the fee
 * here is not a refinement — a gross figure is both
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
    // Price the whole token input, then take the fee off the SOL that comes
    // back — mirroring `swap_handler`. Passing feeBps to swapQuote instead
    // would skim the *tokens*, which is a different figure and one the
    // program will not match.
    const base = BigInt(Math.floor(amount * 10 ** decimals));
    const gross = Number(swapQuote(tokenReserves, solReserves, base, 0)) / LAMPORTS_PER_SOL;
    return gross * netOfFee;
  }

  // Curve: fee off the input before pricing a buy, off the proceeds after
  // pricing a sell — the order the program uses in `buy_quote`/`sell_quote`.
  return side === "buy"
    ? quoteBuy(venue.curve, amount * netOfFee) / 10 ** decimals
    : quoteSell(venue.curve, amount * 10 ** decimals) * netOfFee;
}

/** How close a curve is to graduating, and whether a given buy would tip it. */
export interface GraduationOutlook {
  /** Real SOL the curve must hold to graduate. */
  thresholdSol: number;
  /** Real SOL it holds now. */
  reservesSol: number;
  /** 0..1, clamped. */
  progress: number;
  /**
   * SOL a buyer would have to spend to cross the line, grossed up for the fee.
   *
   * Not simply `threshold - reserves`: only the post-fee portion of a buy
   * reaches the reserve that triggers graduation, so quoting the raw gap would
   * understate what it actually takes.
   */
  remainingSol: number;
  /** True when this specific buy would complete the curve. */
  crosses: boolean;
}

/**
 * What a buy does to a curve's graduation status.
 *
 * Worth surfacing because crossing the threshold is irreversible and abrupt.
 * `complete` is set inside the same instruction that crosses it, and from that
 * moment `buy` and `sell` both refuse — so the trade that graduates a token is
 * also the last trade anyone makes on it until someone runs the migration. A
 * buyer who didn't intend that gets no second chance: nothing in the program
 * can move a curve back under the line, since the only operation that lowers
 * reserves is a sell, and sells are refused too.
 *
 * Returns null once there's a pool, where the question no longer applies.
 */
export function graduationOutlook(
  venue: Venue,
  solIn: number,
  graduationLamports: bigint,
  feeBps: number,
): GraduationOutlook | null {
  if (venue.kind === "pool") return null;
  const thresholdSol = Number(graduationLamports) / LAMPORTS_PER_SOL;
  const reservesSol = Number(venue.curve.realSolReserves) / LAMPORTS_PER_SOL;
  const netOfFee = 1 - feeBps / 10_000;
  const gap = Math.max(0, thresholdSol - reservesSol);

  return {
    thresholdSol,
    reservesSol,
    progress: thresholdSol > 0 ? Math.min(1, reservesSol / thresholdSol) : 0,
    // Grossed up: a buy of X only adds X * (1 - fee) to the reserve.
    remainingSol: netOfFee > 0 ? gap / netOfFee : gap,
    // Already complete counts as crossed regardless of the amount — the
    // caller shouldn't have to special-case a curve that's past the line.
    crosses:
      venue.kind === "stranded" ||
      (solIn > 0 && reservesSol + solIn * netOfFee >= thresholdSol),
  };
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
  const [global, venue, genesisPool] = await Promise.all([
    program.account.global.fetch(globalPda()),
    resolveVenue(program, mint),
    findGenesisPool(program, mint),
  ]);
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
    return swapOnPoolTx(
      program,
      trader,
      mint,
      amountIn,
      minOut,
      side === "buy",
      global.treasury,
      genesisPool,
    );
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
        genesisPool,
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
      genesisPool,
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
  treasury: PublicKey,
  genesisPool: PublicKey | null,
): Promise<string> {
  const pool = poolPda(mint);
  return program.methods
    .swap(new BN(amountIn.toString()), new BN(minAmountOut.toString()), isBuy)
    .accountsPartial({
      trader,
      pool,
      // The swap fee no longer stays in the pool: half accrues to the creator
      // on the curve account, half goes to the treasury. Both are required now.
      treasury,
      curve: curvePda(mint),
      mint,
      poolVault: ata(pool, mint),
      traderTokenAccount: ata(trader, mint),
      // Optional on-chain; null means "no discount" rather than a failure, so a
      // wallet without a perk still trades.
      perk: null,
      genesisPool,
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
