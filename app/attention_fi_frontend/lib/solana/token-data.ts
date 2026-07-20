import type { Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { TokenDetail } from "@/lib/mock-data";
import { LAMPORTS_PER_SOL, fetchCurve, fetchGlobal, marketCapSol } from "./curve";

// TODO: replace with a real SOL/USD oracle read. Mirrors the terminal's mock rate.
/** TODO: replace with a real oracle read; shared by every USD conversion. */
export const SOL_USD = 164.2;

/**
 * Build a TokenDetail from live on-chain curve state, keeping mock-only fields
 * (handle, name, mindshare, candles) from `base`. Returns null when the token
 * has no curve on-chain (not launched / not deployed), so callers fall back.
 */
export async function fetchOnchainDetail(
  program: Program<AttentionFi>,
  base: TokenDetail,
  mint: PublicKey,
): Promise<TokenDetail | null> {
  const [curve, global] = await Promise.all([fetchCurve(program, mint), fetchGlobal(program)]);
  if (!curve) return null;

  const decimals = global?.tokenDecimals ?? 6;
  const realSol = Number(curve.realSolReserves) / LAMPORTS_PER_SOL;

  return {
    ...base,
    marketCap: Math.round(marketCapSol(curve, decimals) * SOL_USD),
    raisedUsd: Math.round(realSol * SOL_USD),
    targetUsd: global
      ? Math.round((Number(global.graduationSol) / LAMPORTS_PER_SOL) * SOL_USD)
      : base.targetUsd,
    virtualSol: +(Number(curve.virtualSolReserves) / LAMPORTS_PER_SOL).toFixed(1),
    liquidityUsd: Math.round(realSol * SOL_USD * 2),
    creatorFeeBps: global?.creatorFeeShareBps ?? base.creatorFeeBps,
  };
}
