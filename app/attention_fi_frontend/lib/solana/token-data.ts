import type { Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { TokenDetail } from "@/lib/mock-data";
import { fetchAnyCurve, fetchGlobal, LAMPORTS_PER_SOL } from "./curve";
import { launchedMeta } from "./registry";
import { solUsd } from "./sol-usd";

/**
 * Build a TokenDetail from live on-chain state for whichever mechanism launched
 * the token (bonding / conviction / dutch / revenue), keeping mock-only fields
 * (handle, mindshare, candles) from `base`. Returns null when the mint isn't
 * launched on any curve, so callers fall back to the preview.
 */
export async function fetchOnchainDetail(
  program: Program<AttentionFi>,
  base: TokenDetail,
  mint: PublicKey,
): Promise<TokenDetail | null> {
  const global = await fetchGlobal(program);
  const decimals = global?.tokenDecimals ?? 6;
  const curve = await fetchAnyCurve(program, mint, decimals);
  if (!curve) return null;

  // The creator's own name/symbol/image, if this token was launched from the
  // UI — there's no on-chain metadata account for a bare SPL mint, so the
  // generic mock (handle title-cased) is all `base` has otherwise.
  const meta = launchedMeta(base.handle);
  const usd = solUsd();

  return {
    ...base,
    name: meta?.name || base.name,
    symbol: meta?.symbol || base.symbol,
    image: meta?.image ?? base.image,
    mechanism: curve.mechanism,
    marketCap: Math.round(curve.marketCapSol * usd),
    raisedUsd: Math.round(curve.realSolReservesSol * usd),
    targetUsd: global
      ? Math.round((Number(global.graduationSol) / LAMPORTS_PER_SOL) * usd)
      : base.targetUsd,
    virtualSol: +curve.spotPriceSol.toFixed(9),
    liquidityUsd: Math.round(curve.realSolReservesSol * usd * 2),
    creatorFeeBps: global?.creatorFeeShareBps ?? base.creatorFeeBps,
  };
}
