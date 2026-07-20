"use client";

import { useEffect, useState } from "react";
import type { TokenDetail } from "@/lib/mock-data";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { handleToMint } from "@/lib/solana/registry";
import { fetchOnchainDetail } from "@/lib/solana/token-data";

export type TokenSource = "mock" | "onchain";

/**
 * Renders the mock detail immediately (SSR-safe), then tries to upgrade it to
 * live on-chain curve state. Falls back to mock when the token isn't registered,
 * the program isn't deployed, or the RPC is unreachable.
 */
export function useLiveTokenDetail(base: TokenDetail): { token: TokenDetail; source: TokenSource } {
  const program = useReadonlyProgram();
  const [live, setLive] = useState<TokenDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLive(null); // reset when the handle changes
    const mint = handleToMint(base.handle);
    if (!mint) return;
    fetchOnchainDetail(program, base, mint)
      .then((result) => {
        if (!cancelled && result) setLive(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [base, program]);

  return live ? { token: live, source: "onchain" } : { token: base, source: "mock" };
}
