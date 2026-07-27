// Handle -> Farcaster FID resolution, against Neynar's snapchain (hub) API.
//
// Why this exists: AttentionFi's universe is X handles, and the mindshare
// aggregator was matching them against Farcaster purely as text. That silently
// under-measures anyone whose Farcaster identity differs, and can't tell "no
// Farcaster presence" apart from "no conversation". `userNameProofByName` is an
// on-protocol username proof, so a hit is authoritative rather than a guess.
//
// Resolutions are cached permanently (they don't change); misses are cached for
// MISS_TTL_S, since a handle with no account today may register one later.

import { farcasterDbConfigured, getIdentities, putIdentity } from "@/lib/farcaster-db";
import { norm } from "@/lib/mindshare-engine";

const SNAPCHAIN_BASE = "https://snapchain-api.neynar.com";
const REQUEST_TIMEOUT_MS = 8000;
const MISS_TTL_S = 7 * 86_400;

/**
 * Farcaster message timestamps are seconds since the Farcaster epoch
 * (2021-01-01T00:00:00Z), NOT unix — a hub cast reading `48994466` is 2022, not
 * 1971. Everything crossing this boundary goes through these two helpers.
 */
export const FARCASTER_EPOCH_S = 1_609_459_200;

export const toFarcasterTime = (unixMs: number): number =>
  Math.max(0, Math.floor(unixMs / 1000) - FARCASTER_EPOCH_S);

export const fromFarcasterTime = (farcasterS: number): number =>
  (farcasterS + FARCASTER_EPOCH_S) * 1000;

interface UserNameProofResponse {
  fid?: number;
  name?: string;
}

/** In-process cache, so repeated sweeps in one instance skip the DB entirely. */
const memo = new Map<string, number | null>();

/** One live lookup. Returns an FID, or null for "no account with that name". */
async function lookupFid(handle: string, apiKey: string): Promise<number | null | undefined> {
  const url = `${SNAPCHAIN_BASE}/v1/userNameProofByName?name=${encodeURIComponent(handle)}`;
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 404 is a definitive "no such username" — cache it as a miss.
    if (res.status === 404) return null;
    if (!res.ok) return undefined; // transient/auth — don't cache
    const body = (await res.json()) as UserNameProofResponse;
    return typeof body.fid === "number" && body.fid > 0 ? body.fid : null;
  } catch {
    return undefined; // network failure — don't cache
  }
}

/**
 * Resolve many handles at once. Reads the cache in one round trip, looks up
 * only what's missing or stale, and writes results back. Never throws: an
 * unresolvable handle simply maps to null and the caller falls back to text
 * matching.
 */
export async function resolveFids(
  handles: string[],
  apiKey: string,
): Promise<Map<string, number | null>> {
  const universe = [...new Set(handles.map(norm))];
  const out = new Map<string, number | null>();
  const pending: string[] = [];

  for (const h of universe) {
    if (memo.has(h)) {
      out.set(h, memo.get(h)!);
    } else {
      pending.push(h);
    }
  }
  if (pending.length === 0) return out;

  // Warm from the durable cache where available.
  const stillPending: string[] = [];
  if (farcasterDbConfigured()) {
    try {
      const cached = await getIdentities(pending);
      for (const h of pending) {
        const row = cached.get(h);
        // A hit is permanent; a miss is only trusted for MISS_TTL_S.
        if (row && (row.fid !== null || row.ageSec < MISS_TTL_S)) {
          memo.set(h, row.fid);
          out.set(h, row.fid);
        } else {
          stillPending.push(h);
        }
      }
    } catch {
      stillPending.push(...pending); // DB down — resolve live
    }
  } else {
    stillPending.push(...pending);
  }

  // Resolve the remainder sequentially; this list is short and shrinks to zero
  // as the cache fills, so there's no need to hammer the API in parallel.
  for (const h of stillPending) {
    const fid = await lookupFid(h, apiKey);
    if (fid === undefined) {
      out.set(h, null); // treat as unresolved for this sweep, but don't cache
      continue;
    }
    memo.set(h, fid);
    out.set(h, fid);
    if (farcasterDbConfigured()) {
      await putIdentity(h, fid).catch(() => undefined);
    }
  }
  return out;
}

/** Recent casts authored by an FID inside a window, or null on failure. */
export async function countCastsByFid(
  fid: number,
  sinceMs: number,
  apiKey: string,
): Promise<number | null> {
  const url = new URL(`${SNAPCHAIN_BASE}/v1/castsByFid`);
  url.searchParams.set("fid", String(fid));
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("reverse", "1"); // newest first
  url.searchParams.set("startTimestamp", String(toFarcasterTime(sinceMs)));
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { messages?: unknown[] };
    return Array.isArray(body.messages) ? body.messages.length : 0;
  } catch {
    return null;
  }
}
