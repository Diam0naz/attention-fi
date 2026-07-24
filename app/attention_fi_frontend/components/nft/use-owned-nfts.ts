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
  const [state, setState] = useState<OwnedNfts>({ status: "idle", data: [] });

  useEffect(() => {
    if (!address) {
      setState({ status: "idle", data: [] });
      return;
    }
    let cancelled = false;
    setState((s) => ({ status: "loading", data: s.data }));
    fetchOwnedNfts(program, new PublicKey(address))
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", data: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [address, program]);

  return state;
}
