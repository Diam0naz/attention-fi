"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
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

/**
 * The connected wallet's on-chain credentials, kept current.
 *
 * Credentials are minted on other screens (verification on /launch, perks by
 * the protocol), so any surface reporting them has to notice changes it didn't
 * cause. Re-reads whenever the tab regains focus, which covers finishing a flow
 * in another tab or coming back from a wallet popup.
 *
 * Never substitutes placeholder data: an unread or failed portfolio reports as
 * such, because telling a wallet it holds a credential it doesn't is worse than
 * telling it nothing.
 */
export function useNftPortfolio(): NftPortfolioState {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  const [data, setData] = useState<NftPortfolio | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Status is only set from the async resolution, never synchronously on
  // re-run, so a refresh keeps the last good data on screen instead of
  // flashing back to a loading state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) {
          setData(null);
          setStatus("ready");
        }
        return;
      }
      try {
        const p = await fetchNftPortfolio(program, new PublicKey(address));
        if (!cancelled) {
          setData(p);
          setStatus("ready");
        }
      } catch {
        // Keep whatever was last read — an RPC blip shouldn't retract a badge
        // the wallet genuinely holds.
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, program, nonce]);

  useEffect(() => {
    if (!address) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [address, refresh]);

  return { status, data, refresh };
}
