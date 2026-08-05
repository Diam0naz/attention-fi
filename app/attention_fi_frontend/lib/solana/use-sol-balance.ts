"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { getConnection } from "./program";
import { LAMPORTS_PER_SOL } from "./curve";

/**
 * The connected wallet's SOL balance (refreshed periodically). Null when no
 * wallet is connected or the RPC is unreachable.
 */
export function useSolBalance(): number | null {
  const { address } = useWallet();
  // The reading is stored with the address it belongs to, and the answer is
  // derived by comparing that against the current one. Clearing it in an
  // effect instead would be both a cascading render and, as written, wrong:
  // the reset only fired when `address` became falsy, so switching from one
  // wallet to another kept showing the previous wallet's balance until the new
  // fetch landed. Derived, there is no render where the two disagree.
  const [snapshot, setSnapshot] = useState<{ address: string; sol: number } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const connection = getConnection();
    const pubkey = new PublicKey(address);
    const load = () =>
      connection
        .getBalance(pubkey)
        .then((lamports) => {
          if (!cancelled) setSnapshot({ address, sol: lamports / LAMPORTS_PER_SOL });
        })
        .catch(() => undefined);

    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  return snapshot && snapshot.address === address ? snapshot.sol : null;
}
