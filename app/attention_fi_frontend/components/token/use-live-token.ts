"use client";

import { useCallback, useEffect, useState } from "react";
import type { TokenDetail } from "@/lib/mock-data";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { handleToMint, launchedMeta, resolveTokenFromDb, type LaunchedTokenMeta } from "@/lib/solana/registry";
import { fetchOnchainDetail } from "@/lib/solana/token-data";

export type TokenSource = "mock" | "onchain";

/** Overlay a launcher's name/symbol/image onto the mock base so the page shows
 *  what was actually launched, whether or not the on-chain curve reads. */
function withMeta(base: TokenDetail, meta: LaunchedTokenMeta | null): TokenDetail {
  if (!meta) return base;
  return {
    ...base,
    name: meta.name || base.name,
    symbol: meta.symbol || base.symbol,
    image: meta.image ?? base.image,
  };
}

/**
 * Renders the mock detail immediately (SSR-safe), then overlays the launcher's
 * real metadata (name/symbol/image) and upgrades to live on-chain curve state.
 * Falls back to the mock+metadata view when the token isn't registered, the
 * program isn't deployed, or the RPC is unreachable.
 */
export function useLiveTokenDetail(base: TokenDetail): {
  token: TokenDetail;
  source: TokenSource;
  refresh: () => void;
} {
  const program = useReadonlyProgram();
  const [nonce, setNonce] = useState(0);
  const [detail, setDetail] = useState<{ token: TokenDetail; source: TokenSource }>({
    token: withMeta(base, typeof window === "undefined" ? null : launchedMeta(base.handle)),
    source: "mock",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Local cache first (fast, synchronous); fall back to the durable DB so a
      // visitor sees the right name/image/mint for a token launched elsewhere.
      const localMint = handleToMint(base.handle);
      const local = launchedMeta(base.handle);
      const fromDb = localMint && local ? null : await resolveTokenFromDb(base.handle);
      if (cancelled) return;

      const mint = localMint ?? fromDb?.mint ?? null;
      const meta = local ?? fromDb?.meta ?? null;
      const merged = withMeta(base, meta);
      setDetail({ token: merged, source: "mock" });

      if (!mint) return;
      const result = await fetchOnchainDetail(program, merged, mint).catch(() => null);
      if (!cancelled && result) setDetail({ token: result, source: "onchain" });
    })();
    return () => {
      cancelled = true;
    };
  }, [base, program, nonce]);

  // Bumping the nonce re-runs the effect, which keeps the last good data on
  // screen while the re-read is in flight rather than blanking the page.
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...detail, refresh };
}
