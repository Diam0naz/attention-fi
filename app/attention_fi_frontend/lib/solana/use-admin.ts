"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";

/** True when the connected wallet is the program's global authority (admin). */
export function useIsAdmin(): boolean {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  const [authority, setAuthority] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGlobal(program)
      .then((g) => {
        if (!cancelled && g) setAuthority(g.authority);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [program]);

  return Boolean(address && authority && address === authority);
}
