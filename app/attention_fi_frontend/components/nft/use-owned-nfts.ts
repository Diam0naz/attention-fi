"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { NftCardData } from "@/components/nft/nft-card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchOwnedNfts } from "@/lib/solana/nft-data";

/**
 * The connected wallet's on-chain AttentionFi NFTs.
 * - null  → not connected / RPC error → callers fall back to mock.
 * - []    → connected, none held (real empty).
 * - [...] → real owned NFTs.
 */
export function useOwnedNfts(): NftCardData[] | null {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  const [data, setData] = useState<NftCardData[] | null>(null);

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    let cancelled = false;
    fetchOwnedNfts(program, new PublicKey(address))
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, program]);

  return data;
}
