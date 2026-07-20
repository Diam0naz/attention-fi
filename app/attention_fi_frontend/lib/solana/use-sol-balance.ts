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
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    const connection = getConnection();
    const pubkey = new PublicKey(address);
    const load = () =>
      connection
        .getBalance(pubkey)
        .then((lamports) => {
          if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
        })
        .catch(() => undefined);

    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  return balance;
}
