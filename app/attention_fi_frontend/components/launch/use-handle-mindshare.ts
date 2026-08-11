"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export interface HandleMindshare {
  /** Spot reading — shown for context, never used to price a launch. */
  mindshare: number;
  /** Time-weighted over 24h. This is what decides the tier. */
  mindshare24h: number;
  /** 0..1 of the 24h window the history actually covers. */
  coverage24h: number;
  rank: number;
  delta24h: number;
  source: string;
}

const norm = (h: string) => h.trim().replace(/^@/, "").toLowerCase();

/**
 * Wait for typing to stop before asking. The handle box fires on every
 * keystroke and each request sweeps the whole tracked universe server-side.
 */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/**
 * A handle's mindshare, for pricing a launch.
 *
 * The launch screen previously used a hardcoded 0.98, so every creator was told
 * they sat at the same mindshare and every token seeded at the same tier no
 * matter whose attention it tracked — which is the one number the whole product
 * is about.
 *
 * Consumers should price from `mindshare24h`, not `mindshare`. Spot is a single
 * instant and a launch can be timed against it: post something that spikes, and
 * launch into the spike at a seed the following day wouldn't support. The
 * trailing average is what the on-chain Switchboard oracle reads for exactly
 * this reason, so using it here also keeps the two launch paths — oracle-backed
 * and client-priced — agreeing about what a handle is worth.
 */
export function useHandleMindshare(handle: string) {
  const settled = useDebounced(norm(handle), 400);

  return useQuery({
    queryKey: ["mindshare", settled],
    queryFn: async (): Promise<HandleMindshare> => {
      const res = await fetch(`/api/mindshare?handle=${encodeURIComponent(settled)}`);
      if (!res.ok) throw new Error(`mindshare lookup failed (${res.status})`);
      return (await res.json()) as HandleMindshare;
    },
    enabled: settled.length > 0,
    staleTime: 60_000,
    // A blip shouldn't blank a number the creator is reading; keep the last
    // good answer on screen while a retry runs.
    placeholderData: (prev) => prev,
  });
}
