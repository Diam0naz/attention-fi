// Organic X mindshare aggregator — Part 1, our self-hosted alternative to Kaito.
//
// Mindshare is *share of conversation*, so we measure it directly from X instead
// of paying for a scored feed: for every tracked handle we pull the recent tweet
// volume around it (mentions of it + its own original posts) via the X API v2
// counts endpoint, then normalize each handle's volume to a percentage of the
// tracked universe's total. Share-of-tracked-universe is exactly what "mindshare
// within the AttentionFi ecosystem" means — the same definition Kaito applies to
// a curated set, only computed from public X signals we own and control.
//
// Enabled by X_BEARER_TOKEN (an app-only bearer token). When it's unset — or when
// a sweep rate-limits / fails badly — this returns null and the caller falls back
// to the deterministic engine for the *whole* universe (never a unit-mismatched
// mix). Results are cached in-process for X_MINDSHARE_TTL_S (default 600s) because
// the counts endpoint is aggressively rate-limited.

import { norm } from "@/lib/mindshare-engine";

const COUNTS_URL = "https://api.x.com/2/tweets/counts/recent";
const SWEEP_CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 6000;
const DEFAULT_TTL_S = 600;

export function xMindshareConfigured(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN);
}

function ttlMs(): number {
  const s = Number(process.env.X_MINDSHARE_TTL_S);
  return (Number.isFinite(s) && s > 0 ? s : DEFAULT_TTL_S) * 1000;
}

// Conversation around a handle: mentions of it plus its own original posts, with
// retweets excluded so raw reach isn't double-counted as fresh conversation.
function handleQuery(handle: string): string {
  const h = norm(handle);
  return `(@${h} OR from:${h}) -is:retweet`;
}

interface CountsResponse {
  meta?: { total_tweet_count?: number };
}

/** Recent (~7d) tweet volume for one handle, or null on any failure. */
async function fetchVolume(handle: string, token: string): Promise<number | null> {
  try {
    const url = `${COUNTS_URL}?query=${encodeURIComponent(handleQuery(handle))}&granularity=day`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as CountsResponse;
    const total = json.meta?.total_tweet_count;
    return typeof total === "number" && Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

// Bounded-concurrency async map, so a large universe doesn't fan out into a
// burst of requests that trips X's rate limiter.
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
 * Mindshare (percent) for every handle in the tracked universe, each normalized
 * to its share of the universe's total X conversation volume. Returns null when
 * the aggregator is unconfigured, or when the sweep fails badly enough to be
 * untrustworthy — so the caller falls back to the engine for the whole universe
 * rather than mixing real shares with engine estimates.
 */
export async function computeUniverseMindshare(
  handles: string[],
): Promise<Map<string, number> | null> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;

  const universe = [...new Set(handles.map(norm))];
  if (universe.length === 0) return null;

  if (cache && Date.now() - cache.at < ttlMs()) {
    // Serve cached. A handle added since the last sweep is simply absent, so the
    // caller engine-fills it until the next sweep picks it up.
    return cache.map;
  }

  const volumes = await mapLimit(universe, SWEEP_CONCURRENCY, (h) => fetchVolume(h, token));
  const failed = volumes.filter((v) => v === null).length;
  // If most handles failed (rate limit / outage), don't publish a skewed map.
  if (failed > universe.length / 2) return null;

  const safe = volumes.map((v) => (v === null ? 0 : v));
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
