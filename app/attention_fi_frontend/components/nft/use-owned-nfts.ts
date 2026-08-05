"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { NftCardData } from "@/components/nft/nft-card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchOwnedNfts } from "@/lib/solana/nft-data";

export interface OwnedNfts {
  /** "idle" (no wallet), "loading", "ready" (real data, possibly empty), "error" (RPC failed). */
  status: "idle" | "loading" | "ready" | "error";
  data: NftCardData[];
}

/**
 * The connected wallet's on-chain AttentionFi NFTs. Callers must not silently
 * substitute mock data for "error" — that shows a real wallet fake NFTs it
 * doesn't hold. Only "idle" (not connected) is a legitimate place to fall
 * back to a demo collection.
 */
export function useOwnedNfts(): OwnedNfts {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  // Only settled results are stored, tagged with the wallet they describe.
  // "idle" and "loading" are derived rather than written, which removes both
  // effect-body writes and the bug they carried: the loading state preserved
  // `data` across a wallet switch, so wallet B briefly rendered wallet A's
  // NFTs as its own.
  const [settled, setSettled] = useState<{ address: string; result: OwnedNfts } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetchOwnedNfts(program, new PublicKey(address))
      .then((data) => {
        if (!cancelled) setSettled({ address, result: { status: "ready", data } });
      })
      .catch(() => {
        if (!cancelled) setSettled({ address, result: { status: "error", data: [] } });
      });
    return () => {
      cancelled = true;
    };
  }, [address, program]);

  if (!address) return { status: "idle", data: [] };
  if (!settled || settled.address !== address) return { status: "loading", data: [] };
  return settled.result;
}
