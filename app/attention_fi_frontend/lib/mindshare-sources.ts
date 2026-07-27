// Which aggregator produces the mindshare numbers.
//
// The pipeline is deliberately source-agnostic: every consumer — the feeds, the
// Neon history, the Switchboard job's $.mindshare, and the on-chain tier — sees
// the same shape no matter which substrate the number came from. This module is
// the single place that decides.
//
// MINDSHARE_SOURCE:
//   auto (default) — Farcaster if configured, then X, then the engine
//   farcaster      — Farcaster only (no X fallback)
//   x              — X only (no Farcaster fallback)
//   engine         — force the deterministic engine (useful for demos)
//
// Any configured source that fails a sweep falls through to the next; the
// engine is the terminal fallback and never fails.

import {
  computeUniverseMindshare as farcasterUniverse,
  farcasterMindshareConfigured,
} from "@/lib/farcaster-mindshare";
import type { MindshareSource } from "@/lib/mindshare-engine";
import {
  computeUniverseMindshare as xUniverse,
  xMindshareConfigured,
} from "@/lib/x-mindshare";

export interface ResolvedUniverse {
  /** Handle → mindshare percent, or null when every source declined. */
  map: Map<string, number> | null;
  /** Which source produced `map`; "engine" when none did. */
  source: MindshareSource;
}

type Preference = "auto" | "farcaster" | "x" | "engine";

function preference(): Preference {
  const raw = (process.env.MINDSHARE_SOURCE ?? "auto").toLowerCase();
  if (raw === "farcaster" || raw === "x" || raw === "engine") return raw;
  return "auto";
}

/**
 * Resolve the whole tracked universe from the best available source. Universes
 * are normalized as a set (each handle's share is relative to the total), so
 * this is deliberately all-or-nothing per source rather than per handle.
 */
export async function resolveUniverseMindshare(handles: string[]): Promise<ResolvedUniverse> {
  const pref = preference();
  if (pref === "engine") return { map: null, source: "engine" };

  const tryFarcaster = pref === "auto" || pref === "farcaster";
  const tryX = pref === "auto" || pref === "x";

  if (tryFarcaster && farcasterMindshareConfigured()) {
    const map = await farcasterUniverse(handles).catch(() => null);
    if (map) return { map, source: "farcaster" };
  }
  if (tryX && xMindshareConfigured()) {
    const map = await xUniverse(handles).catch(() => null);
    if (map) return { map, source: "x" };
  }
  return { map: null, source: "engine" };
}
