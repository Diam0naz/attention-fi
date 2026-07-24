"use client";

import { useEffect, useState } from "react";
import { fetchAllCurves, fetchGlobal, marketCapSol, spotPriceSol, type CurveState } from "@/lib/solana/curve";
import { getReadonlyProgram } from "@/lib/solana/program";
import { allTokenHandles, handleToMint, launchedMeta } from "@/lib/solana/registry";
import { SOL_USD } from "@/lib/solana/token-data";
import { MOCK_TOKENS, tierFromMindshare, type Tier, type Token } from "@/lib/mock-data";

/**
 * The single read path for token listings. Merges live on-chain bonding
 * curves (one getProgramAccounts snapshot) over the curated mock catalog:
 * a handle with a launched curve gets its real market cap, tier and spot
 * price; everything else stays a "hypothetical" preview entry. Components
 * that render token lists should consume this — not MOCK_TOKENS — so the
 * feed upgrades itself token-by-token as launches happen.
 */

export interface IndexedToken extends Token {
  /** true when a launched bonding curve backs this entry */
  live: boolean;
  /** SOL per whole token (live entries only) */
  spotSol?: number;
  /** mint address (live entries only) */
  mint?: string;
}

/** on-chain MindshareTier discriminants, in declaration order */
const TIER_BY_INDEX: Tier[] = ["New", "Emerging", "Top 100", "Top 10"];

const POLL_MS = 30_000;

interface IndexState {
  tokens: IndexedToken[];
  liveCount: number;
  loadedAt: number;
}

/** synchronous fallback so first paint never blanks */
function mockIndex(): IndexState {
  return {
    tokens: MOCK_TOKENS.map((t) => ({ ...t, live: false })),
    liveCount: 0,
    loadedAt: 0,
  };
}

let cache: IndexState = mockIndex();
let inflight: Promise<IndexState> | null = null;
const listeners = new Set<(s: IndexState) => void>();

function titleCase(handle: string): string {
  return handle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildIndex(curves: CurveState[], decimals: number): IndexState {
  const mintToHandle = new Map<string, string>();
  for (const handle of allTokenHandles()) {
    const mint = handleToMint(handle);
    if (mint) mintToHandle.set(mint.toBase58(), handle);
  }

  const liveByHandle = new Map<string, CurveState>();
  for (const curve of curves) {
    const handle = mintToHandle.get(curve.mint);
    if (handle) liveByHandle.set(handle, curve);
  }

  const seen = new Set<string>();
  const tokens: IndexedToken[] = [];

  for (const base of MOCK_TOKENS) {
    const handle = base.handle.toLowerCase();
    seen.add(handle);
    const curve = liveByHandle.get(handle);
    if (!curve) {
      tokens.push({ ...base, live: false });
      continue;
    }
    tokens.push({
      ...base,
      live: true,
      mint: curve.mint,
      spotSol: spotPriceSol(curve, decimals),
      marketCap: Math.max(1, Math.round(marketCapSol(curve, decimals) * SOL_USD)),
      tier: TIER_BY_INDEX[curve.tier] ?? base.tier,
    });
  }

  // tokens launched from the UI that the curated catalog doesn't know yet
  for (const [handle, curve] of liveByHandle) {
    if (seen.has(handle)) continue;
    const mindshare = 0.08;
    const meta = launchedMeta(handle);
    tokens.push({
      rank: 0,
      handle,
      name: meta?.name || titleCase(handle),
      vertical: "Narrative",
      mindshare,
      marketCap: Math.max(1, Math.round(marketCapSol(curve, decimals) * SOL_USD)),
      delta24h: 0,
      tier: TIER_BY_INDEX[curve.tier] ?? tierFromMindshare(mindshare),
      verified: false,
      spark: [0.05, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.08],
      image: meta?.image,
      live: true,
      mint: curve.mint,
      spotSol: spotPriceSol(curve, decimals),
    });
  }

  tokens.sort((a, b) => b.marketCap - a.marketCap);
  for (let i = 0; i < tokens.length; i++) tokens[i]!.rank = i + 1;

  return { tokens, liveCount: liveByHandle.size, loadedAt: Date.now() };
}

let globalOnce: ReturnType<typeof fetchGlobal> | null = null;

export function fetchTokenIndex(force = false): Promise<IndexState> {
  if (!force && Date.now() - cache.loadedAt < POLL_MS / 2) {
    return Promise.resolve(cache);
  }
  if (inflight) return inflight;
  inflight = (async () => {
    const program = getReadonlyProgram();
    globalOnce ??= fetchGlobal(program);
    const [curves, global] = await Promise.all([fetchAllCurves(program), globalOnce]);
    if (curves.length > 0) {
      cache = buildIndex(curves, global?.tokenDecimals ?? 6);
      for (const cb of listeners) cb(cache);
    }
    return cache;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Live token index for list UIs. Returns the mock catalog synchronously on
 * first render, then upgrades in place once the chain snapshot arrives and
 * keeps polling while mounted. All mounted consumers share one fetch.
 */
export function useTokenIndex(): { tokens: IndexedToken[]; liveCount: number } {
  const [state, setState] = useState<IndexState>(cache);

  useEffect(() => {
    listeners.add(setState);
    void fetchTokenIndex();
    const timer = setInterval(() => void fetchTokenIndex(true), POLL_MS);
    return () => {
      listeners.delete(setState);
      clearInterval(timer);
    };
  }, []);

  return { tokens: state.tokens, liveCount: state.liveCount };
}
