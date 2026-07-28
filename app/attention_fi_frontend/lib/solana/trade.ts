import { BN, type Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import {
  ata,
  auctionPda,
  convictionPda,
  curvePda,
  globalPda,
  positionPda,
  revenuePda,
  revStakePda,
} from "./program";
import {
  LAMPORTS_PER_SOL,
  auctionQuote,
  fetchAuctionDetail,
  fetchConvictionDetail,
  fetchCurve,
  quoteBuy,
  quoteSell,
  type ConvictionDetail,
} from "./curve";

/**
 * Buy `solAmount` SOL worth of `mint` from its bonding curve. Computes a
 * slippage-protected min-out from the current reserves. Returns the tx sig.
 * Account layout verified against the IDL (see scripts/buy-token.ts).
 */
export async function buyTokens(
  program: Program<AttentionFi>,
  buyer: PublicKey,
  mint: PublicKey,
  solAmount: number,
  slippageBps = 100,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const curve = await fetchCurve(program, mint);
  if (!curve) throw new Error("This token isn't live on-chain yet.");

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const minOut = Math.max(0, Math.floor(quoteBuy(curve, solAmount) * (1 - slippageBps / 10_000)));
  const curveKey = curvePda(mint);

  return program.methods
    .buy(new BN(lamports), new BN(minOut))
    .accountsPartial({
      buyer,
      treasury: global.treasury,
      curve: curveKey,
      mint,
      vault: ata(curveKey, mint),
      buyerTokenAccount: ata(buyer, mint),
      perk: null,
    })
    .rpc();
}

/** Sell `tokenAmount` whole tokens back to the curve. */
export async function sellTokens(
  program: Program<AttentionFi>,
  seller: PublicKey,
  mint: PublicKey,
  tokenAmount: number,
  decimals: number,
  slippageBps = 100,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const curve = await fetchCurve(program, mint);
  if (!curve) throw new Error("This token isn't live on-chain yet.");

  const rawTokens = Math.floor(tokenAmount * 10 ** decimals);
  const expectedSol = quoteSell(curve, rawTokens);
  const minSol = Math.max(0, Math.floor(expectedSol * (1 - slippageBps / 10_000) * LAMPORTS_PER_SOL));
  const curveKey = curvePda(mint);

  return program.methods
    .sell(new BN(rawTokens), new BN(minSol))
    .accountsPartial({
      seller,
      treasury: global.treasury,
      curve: curveKey,
      mint,
      vault: ata(curveKey, mint),
      sellerTokenAccount: ata(seller, mint),
      perk: null,
    })
    .rpc();
}

// --- Dutch auction -----------------------------------------------------------
// An auction is not a curve with different numbers: there is no sell side, the
// price falls on a schedule rather than with demand, and a bid is capped by a
// max price instead of guarded by slippage. These are separate calls because
// they are separate actions, not variants of buy/sell.

/**
 * Bid for `tokenAmount` whole tokens at the auction's current descending price.
 *
 * `maxPriceSol` caps what you'll pay per whole token — the on-chain equivalent
 * of slippage protection here, since the price moves with the clock and can
 * only ever fall. Passing the price you were shown means a bid that would fill
 * above it reverts rather than overpaying.
 *
 * The program clamps the fill to whatever allocation remains, so bidding for
 * more than is left buys the remainder instead of failing.
 */
export async function bidAuction(
  program: Program<AttentionFi>,
  bidder: PublicKey,
  mint: PublicKey,
  tokenAmount: number,
  maxPriceSol?: number,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const decimals = global.tokenDecimals;
  const auction = await fetchAuctionDetail(program, mint, decimals);
  if (!auction) throw new Error("This token has no auction on-chain.");
  if (auction.complete) throw new Error("This auction has already been settled.");
  if (auction.ended) throw new Error("This auction has ended — it can be settled, not bid on.");
  if (auction.remaining === 0n) throw new Error("This auction is sold out.");

  const amount = BigInt(Math.floor(tokenAmount * 10 ** decimals));
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");

  // Default the cap to the current price: the price only descends, so this can
  // only reject a stale quote, never an improved one.
  const maxPriceLamports =
    maxPriceSol === undefined
      ? auction.priceLamports
      : BigInt(Math.floor(maxPriceSol * LAMPORTS_PER_SOL));

  const auctionKey = auctionPda(mint);
  return program.methods
    .bid(new BN(amount.toString()), new BN(maxPriceLamports.toString()))
    .accountsPartial({
      bidder,
      treasury: global.treasury,
      auction: auctionKey,
      mint,
      vault: ata(auctionKey, mint),
      bidderTokenAccount: ata(bidder, mint),
    })
    .rpc();
}

/**
 * What a bid will actually cost, mirroring the program's rounding so the
 * displayed total is never under what gets charged.
 */
export async function quoteBid(
  program: Program<AttentionFi>,
  mint: PublicKey,
  tokenAmount: number,
): Promise<{ costSol: number; feeSol: number; totalSol: number; priceSol: number } | null> {
  const global = await program.account.global.fetch(globalPda());
  const decimals = global.tokenDecimals;
  const auction = await fetchAuctionDetail(program, mint, decimals);
  if (!auction) return null;

  // Bidding past the remaining allocation fills only the remainder, so quote
  // what will actually be bought rather than what was typed.
  const requested = BigInt(Math.floor(tokenAmount * 10 ** decimals));
  const fill = requested > auction.remaining ? auction.remaining : requested;
  const { costLamports, feeLamports, totalLamports } = auctionQuote(
    auction.priceLamports,
    fill,
    decimals,
    global.feeBps,
  );
  return {
    costSol: Number(costLamports) / LAMPORTS_PER_SOL,
    feeSol: Number(feeLamports) / LAMPORTS_PER_SOL,
    totalSol: Number(totalLamports) / LAMPORTS_PER_SOL,
    priceSol: auction.priceSol,
  };
}

/** Finalize an ended auction. Permissionless — anyone can call it. */
export async function settleAuction(
  program: Program<AttentionFi>,
  caller: PublicKey,
  mint: PublicKey,
): Promise<string> {
  return program.methods
    .settleAuction()
    .accountsPartial({ caller, auction: auctionPda(mint), mint })
    .rpc();
}

/* ── conviction ─────────────────────────────────────────────────────────── */

/**
 * Buy into a conviction curve. Same constant-product pricing as `buyTokens`,
 * but the resulting position is locked.
 *
 * Note for callers: the program sets `unlock_time = now + lock_period` on every
 * buy, so adding to a position re-locks the whole thing — not just the new
 * tokens. The panel warns about this before submitting.
 */
export async function buyConviction(
  program: Program<AttentionFi>,
  buyer: PublicKey,
  mint: PublicKey,
  solAmount: number,
  slippageBps = 100,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const detail = await fetchConvictionDetail(program, mint, global.tokenDecimals);
  if (!detail) throw new Error("This token isn't live on a conviction curve.");

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const minOut = Math.max(
    0,
    Math.floor(quoteBuy(detail.curve, solAmount) * (1 - slippageBps / 10_000)),
  );
  const curveKey = convictionPda(mint);

  return program.methods
    .buyConviction(new BN(lamports), new BN(minOut))
    .accountsPartial({
      buyer,
      treasury: global.treasury,
      curve: curveKey,
      mint,
      vault: ata(curveKey, mint),
      buyerTokenAccount: ata(buyer, mint),
      position: positionPda(mint, buyer),
    })
    .rpc();
}

/**
 * Sell out of a conviction position.
 *
 * `minSolOut` is checked by the program against the amount *after* the
 * early-exit penalty, so the slippage floor is computed from the penalised
 * proceeds — otherwise every locked sell would trip it.
 */
export async function sellConviction(
  program: Program<AttentionFi>,
  seller: PublicKey,
  mint: PublicKey,
  tokenAmount: number,
  decimals: number,
  slippageBps = 100,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const detail = await fetchConvictionDetail(program, mint, decimals, seller);
  if (!detail) throw new Error("This token isn't live on a conviction curve.");

  const raw = BigInt(Math.floor(tokenAmount * 10 ** decimals));
  const grossSol = quoteSell(detail.curve, Number(raw));
  const afterFee = grossSol * (1 - global.feeBps / 10_000);
  const locked = detail.position !== null && Date.now() / 1000 < detail.position.unlockTime;
  const afterPenalty = locked
    ? afterFee * (1 - detail.earlyExitPenaltyBps / 10_000)
    : afterFee;
  const minOut = Math.max(
    0,
    Math.floor(afterPenalty * LAMPORTS_PER_SOL * (1 - slippageBps / 10_000)),
  );
  const curveKey = convictionPda(mint);

  return program.methods
    .sellConviction(new BN(raw.toString()), new BN(minOut))
    .accountsPartial({
      seller,
      treasury: global.treasury,
      curve: curveKey,
      mint,
      vault: ata(curveKey, mint),
      sellerTokenAccount: ata(seller, mint),
      position: positionPda(mint, seller),
    })
    .rpc();
}

/** What a conviction sell actually pays out, split so the UI can show the cut. */
export function quoteConvictionSell(
  detail: ConvictionDetail,
  tokenAmount: number,
  decimals: number,
  feeBps: number,
  nowSeconds: number,
): { grossSol: number; feeSol: number; penaltySol: number; netSol: number; locked: boolean } {
  if (tokenAmount <= 0) {
    return { grossSol: 0, feeSol: 0, penaltySol: 0, netSol: 0, locked: false };
  }
  const grossSol = quoteSell(detail.curve, tokenAmount * 10 ** decimals);
  const feeSol = grossSol * (feeBps / 10_000);
  const afterFee = grossSol - feeSol;
  const locked = detail.position !== null && nowSeconds < detail.position.unlockTime;
  const penaltySol = locked ? afterFee * (detail.earlyExitPenaltyBps / 10_000) : 0;
  return { grossSol, feeSol, penaltySol, netSol: afterFee - penaltySol, locked };
}

/* ── revenue share ──────────────────────────────────────────────────────── */

/** Buy `shares` whole shares at the offering's fixed price. */
export async function buyRevenue(
  program: Program<AttentionFi>,
  buyer: PublicKey,
  mint: PublicKey,
  shares: number,
  decimals: number,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  const raw = BigInt(Math.floor(shares * 10 ** decimals));

  return program.methods
    .buyRevenue(new BN(raw.toString()))
    .accountsPartial({
      buyer,
      treasury: global.treasury,
      revenue: revenuePda(mint),
      mint,
      position: revStakePda(mint, buyer),
    })
    .rpc();
}

/** Claim accrued revenue on a stake. */
export async function claimRevenue(
  program: Program<AttentionFi>,
  holder: PublicKey,
  mint: PublicKey,
): Promise<string> {
  return program.methods
    .claimRevenue()
    .accountsPartial({
      holder,
      revenue: revenuePda(mint),
      mint,
      position: revStakePda(mint, holder),
      owner: holder,
    })
    .rpc();
}
