// Farcaster mindshare aggregator — a free-tier alternative to the X path.
//
// Same idea as lib/x-mindshare.ts, same contract: measure how much of the
// tracked universe's recent conversation belongs to each handle, and return
// percentages that sum to ~100. Only the substrate differs — casts instead of
// posts — which is why nothing downstream (the /api/mindshare shape, the
// Switchboard job, the on-chain instructions) needs to know which one ran.
//
// Enabled by NEYNAR_API_KEY. Neynar's cast search returns paginated results
// with NO total count, so volume is counted from the returned casts inside a
// rolling window rather than read from a `total` field — see countCasts.
// Results are cached in-process for FARCASTER_MINDSHARE_TTL_S (default 600s).

import { norm } from "@/lib/mindshare-engine";

const SEARCH_URL = "https://api.neynar.com/v2/farcaster/cast/search";
const PAGE_SIZE = 100; // Neynar max
const MAX_PAGES = 2; // caps cost/latency: at most 200 casts counted per handle
const WINDOW_DAYS = 7; // matches X's "recent" window, so the two are comparable
const SWEEP_CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_TTL_S = 600;

export function farcasterMindshareConfigured(): boolean {
  return Boolean(process.env.NEYNAR_API_KEY);
}

function ttlMs(): number {
  const s = Number(process.env.FARCASTER_MINDSHARE_TTL_S);
  return (Number.isFinite(s) && s > 0 ? s : DEFAULT_TTL_S) * 1000;
}

interface CastSearchResponse {
  result?: {
    casts?: { timestamp?: string }[];
    next?: { cursor?: string | null };
  };
}

/**
 * Count casts mentioning `handle` within the trailing window.
 *
 * Neynar returns newest-first (desc_chron) and gives no total, so we page until
 * we either run out of pages, run out of results, or cross the window boundary
 * — at which point everything after is older and can be stopped on. The count
 * saturates at MAX_PAGES * PAGE_SIZE; that's acceptable because mindshare is a
 * *relative* measure and the cap applies equally to every handle.
 */
async function countCasts(handle: string, apiKey: string): Promise<number | null> {
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  let count = 0;
  let cursor: string | null = null;
  let sawAny = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", norm(handle));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("sort_type", "desc_chron");
    if (cursor) url.searchParams.set("cursor", cursor);

    let body: CastSearchResponse;
    try {
      const res = await fetch(url, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return sawAny ? count : null;
      body = (await res.json()) as CastSearchResponse;
    } catch {
      return sawAny ? count : null;
    }

    const casts = body.result?.casts ?? [];
    if (casts.length === 0) break;
    sawAny = true;

    let crossedWindow = false;
    for (const c of casts) {
      const t = c.timestamp ? Date.parse(c.timestamp) : Number.NaN;
      // Undated casts are counted rather than dropped; a missing timestamp
      // shouldn't silently deflate a handle's volume.
      if (Number.isNaN(t)) {
        count++;
        continue;
      }
      if (t < cutoff) {
        crossedWindow = true;
        break;
      }
      count++;
    }
    if (crossedWindow) break;

    cursor = body.result?.next?.cursor ?? null;
    if (!cursor) break;
  }
  return count;
}

/** Bounded-concurrency map, so a large universe doesn't burst the rate limit. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

let cache: { at: number; map: Map<string, number> } | null = null;

/**
 * Mindshare (percent) for every handle in the tracked universe, each as its
 * share of the universe's total Farcaster conversation. Returns null when
 * unconfigured, or when the sweep fails badly enough to be untrustworthy — the
 * caller then falls back to the engine for the WHOLE universe rather than
 * mixing real shares with estimates.
 */
export async function computeUniverseMindshare(
  handles: string[],
): Promise<Map<string, number> | null> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return null;

  const universe = [...new Set(handles.map(norm))];
  if (universe.length === 0) return null;

  if (cache && Date.now() - cache.at < ttlMs()) {
    // Serve cached. A handle added since the last sweep is simply absent, so
    // the caller engine-fills it until the next sweep picks it up.
    return cache.map;
  }

  const counts = await mapLimit(universe, SWEEP_CONCURRENCY, (h) => countCasts(h, apiKey));
  const failed = counts.filter((c) => c === null).length;
  // Mostly failures (rate limit / outage) → don't publish a skewed map.
  if (failed > universe.length / 2) return null;

  const safe = counts.map((c) => c ?? 0);
  const total = safe.reduce((a, b) => a + b, 0);
  if (total <= 0) return null; // no signal at all → engine

  const map = new Map<string, number>();
  for (let i = 0; i < universe.length; i++) {
    const share = (safe[i]! / total) * 100;
    map.set(universe[i]!, Math.max(0.01, Math.round(share * 100) / 100));
  }
  cache = { at: Date.now(), map };
  return map;
}
