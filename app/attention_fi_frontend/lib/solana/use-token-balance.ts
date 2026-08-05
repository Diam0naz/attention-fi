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
  // Keyed by wallet *and* mint, then derived — see useSolBalance for why this
  // beats clearing in an effect. It matters more here: this hook is called once
  // per mint on screen, so a stale reading would attribute one token's balance
  // to another for as long as the fetch took.
  const [snapshot, setSnapshot] = useState<{ key: string; amount: number } | null>(null);
  const key = `${address ?? ""}:${mint}`;

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const connection = getConnection();
    const owner = new PublicKey(address);
    let mintPk: PublicKey;
    try {
      mintPk = new PublicKey(mint);
    } catch {
      // Not a valid mint — leave the snapshot stale; the key won't match, so
      // the derived value is null anyway.
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
          setSnapshot({ key: `${address}:${mint}`, amount: total });
        })
        .catch(() => {
          if (!cancelled) setSnapshot(null);
        });

    load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, mint]);

  return snapshot && snapshot.key === key ? snapshot.amount : null;
}
