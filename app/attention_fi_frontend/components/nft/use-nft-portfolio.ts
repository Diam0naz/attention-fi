"use client";

import { useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchNftPortfolio, type NftPortfolio } from "@/lib/solana/nft-data";

export interface NftPortfolioState {
  /** "loading" until the first read resolves; distinguishable from "holds nothing". */
  status: "loading" | "ready" | "error";
  data: NftPortfolio | null;
  /** Force a re-read — call after minting or claiming. */
  refresh: () => void;
}

/** Cache key for a wallet's credentials. Exported so writers can invalidate it. */
export const nftPortfolioKey = (address: string | null | undefined) =>
  ["nft-portfolio", address ?? null] as const;

/**
 * The connected wallet's on-chain credentials, kept current.
 *
 * Backed by the shared query cache, so the four surfaces that show credentials
 * read one copy rather than fetching independently and drifting apart. A
 * transaction can invalidate `nftPortfolioKey` and every one of them updates.
 *
 * Credentials are minted on other screens (verification on /launch, perks by
 * the protocol), so this has to notice changes it didn't cause — refetch on
 * window focus covers finishing a flow in another tab or returning from a
 * wallet popup.
 *
 * Never substitutes placeholder data: an unread or failed portfolio reports as
 * such, because telling a wallet it holds a credential it doesn't is worse than
 * telling it nothing.
 */
export function useNftPortfolio(): NftPortfolioState {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: nftPortfolioKey(address),
    queryFn: () => fetchNftPortfolio(program, new PublicKey(address!)),
    enabled: Boolean(address),
    // An RPC blip shouldn't retract a badge the wallet genuinely holds, so the
    // last good read stays on screen while a retry runs.
    placeholderData: (prev) => prev,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: nftPortfolioKey(address) });
  }, [queryClient, address]);

  // A disconnected wallet holds nothing, and that's a settled answer rather
  // than a pending one.
  if (!address) return { status: "ready", data: null, refresh };

  return {
    status: query.isError && query.data === undefined ? "error" : query.isPending ? "loading" : "ready",
    data: query.data ?? null,
    refresh,
  };
}
