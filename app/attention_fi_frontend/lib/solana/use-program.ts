"use client";

import { useMemo } from "react";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { getProgram, getReadonlyProgram, type AnchorWalletLike } from "./program";

/**
 * Anchor Program bound to the connected wallet, or null when signing isn't
 * possible (not connected, or the wallet can't sign transactions).
 */
export function useProgram() {
  const { address, getSigner } = useWallet();

  return useMemo(() => {
    if (!address) return null;
    const provider = getSigner();
    if (!provider?.signTransaction) return null;

    const wallet: AnchorWalletLike = {
      publicKey: new PublicKey(address),
      signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) =>
        provider.signTransaction!(tx),
      // Not every injected wallet implements signAllTransactions; fall back to
      // signing sequentially so batched calls still work.
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
        if (provider.signAllTransactions) return provider.signAllTransactions(txs);
        const out: T[] = [];
        for (const tx of txs) out.push(await provider.signTransaction!(tx));
        return out;
      },
    };
    return getProgram(wallet);
  }, [address, getSigner]);
}

/** Program for account reads — available with or without a connected wallet. */
export function useReadonlyProgram() {
  return useMemo(() => getReadonlyProgram(), []);
}
