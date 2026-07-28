import { BN, type Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { ata, auctionPda, curvePda, globalPda } from "./program";
import {
  LAMPORTS_PER_SOL,
  auctionQuote,
  fetchAuctionDetail,
  fetchCurve,
  quoteBuy,
  quoteSell,
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
