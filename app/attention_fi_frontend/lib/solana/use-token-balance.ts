"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { getConnection } from "./program";

/**
 * The connected wallet's UI balance for an SPL token mint (sums all token
 * accounts for that mint). 0 when the wallet holds none; null when not
 * connected or the RPC/mint is unreachable.
 */
export function useTokenBalance(mint: string): number | null {
  const { address } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    const connection = getConnection();
    const owner = new PublicKey(address);
    let mintPk: PublicKey;
    try {
      mintPk = new PublicKey(mint);
    } catch {
      setBalance(null);
      return;
    }
    const load = () =>
      connection
        .getParsedTokenAccountsByOwner(owner, { mint: mintPk })
        .then((res) => {
          if (cancelled) return;
          const total = res.value.reduce(
            (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
            0,
          );
          setBalance(total);
        })
        .catch(() => {
          if (!cancelled) setBalance(null);
        });

    load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, mint]);

  return balance;
}
