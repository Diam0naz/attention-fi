import { BN, type Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { ata, curvePda, globalPda } from "./program";
import { LAMPORTS_PER_SOL, fetchCurve, quoteBuy, quoteSell } from "./curve";

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
