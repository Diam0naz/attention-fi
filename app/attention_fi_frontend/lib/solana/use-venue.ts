"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { fetchGlobal } from "@/lib/solana/curve";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { resolveVenue, type Venue } from "@/lib/solana/venue";

export interface VenueState {
  venue: Venue | null;
  decimals: number;
  feeBps: number;
  /** False until the first read lands, so "no venue" and "not read" differ. */
  loaded: boolean;
  /** Re-read after an action that changes the venue — notably graduation. */
  refresh: () => void;
}

/**
 * Which venue a token trades on, kept fresh while the screen is open.
 *
 * Polls rather than reading once: graduation is permissionless, so a token can
 * change venue while someone is looking at it, and a stale read means quoting a
 * curve that has stopped accepting trades.
 */
export function useVenue(mint: PublicKey | null): VenueState {
  const readonly = useReadonlyProgram();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [decimals, setDecimals] = useState(6);
  const [feeBps, setFeeBps] = useState(100);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  const key = mint?.toBase58() ?? "";
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Clearing during render rather than in the effect: without this there is a
  // frame in which the previous token's venue is shown beside the new token's
  // name, which is the pair a trader would size an order against.
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setVenue(null);
    setLoaded(false);
  }

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;
    const load = async () => {
      const [v, g] = await Promise.all([resolveVenue(readonly, mint), fetchGlobal(readonly)]);
      if (cancelled) return;
      setVenue(v);
      if (g) {
        setDecimals(g.tokenDecimals);
        setFeeBps(g.feeBps);
      }
      setLoaded(true);
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readonly, nonce]);

  // No mint is a settled answer, not a pending one — there's nothing to read,
  // so callers shouldn't sit on a spinner waiting for a fetch that never runs.
  return { venue, decimals, feeBps, loaded: mint ? loaded : true, refresh };
}
