// Part 1/2 of the mindshare pipeline: turn a handle into an attention score.
//
// The live source is now the organic X aggregator (`lib/x-mindshare.ts`), which
// measures share-of-conversation directly from public X signals. The route
// computes that universe map and passes each handle's value in as an override;
// this module is the fallback that keeps the whole pipeline — frontend feeds,
// Neon history, the Switchboard oracle, the on-chain seed — running end-to-end
// when the aggregator is unconfigured or a sweep fails.
//
// Kaito is PAUSED (cost): `fetchKaitoMindshare` is retained but no longer called
// on the default path. Set KAITO_API_KEY + KAITO_API_URL and call it explicitly
// to re-enable. Nothing downstream cares where the number came from.

import { MOCK_TOKENS } from "@/lib/mock-data";

export const norm = (handle: string) => handle.replace(/^@/, "").toLowerCase();

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Curated handles keep the strategy-brief baselines (e.g. solana_kol ≈ 3.24%)
// and their vertical; everything else derives a plausible base from its hash.
const CURATED = new Map(
  MOCK_TOKENS.map((t) => [norm(t.handle), { mindshare: t.mindshare, vertical: t.vertical }]),
);

export function curatedVertical(handle: string): string {
  return CURATED.get(norm(handle))?.vertical ?? "Narrative";
}

/**
 * Deterministic mindshare (percent) for a handle at a point in time. Stable
 * within a minute, drifting over hours/days so history and deltas look real.
 */
export function engineMindshare(handle: string, atMs: number = Date.now()): number {
  const h = norm(handle);
  const seed = hashStr(h);
  const base = CURATED.get(h)?.mindshare ?? 0.04 + (seed % 300) / 100; // 0.04–3.04%
  const t = atMs / 1000;
  const drift = Math.sin(t / 86_400 + (seed % 100)) * base * 0.18;
  const wobble = Math.sin(t / 3_600 + (seed % 13)) * base * 0.06;
  return Math.max(0.01, Math.round((base + drift + wobble) * 100) / 100);
}

/** Extract a dotted path (e.g. "data.mindshare") from a parsed JSON value. */
function pluck(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Real mindshare from Kaito, or null when not configured / unavailable (caller
 * falls back to the engine). Kaito's exact URL, auth header, and response field
 * are env-driven so this doesn't hard-code an API shape:
 *   KAITO_API_KEY   — bearer token (required to enable)
 *   KAITO_API_URL   — URL template with {handle} (required to enable)
 *   KAITO_FIELD     — dotted path to the mindshare number (default "mindshare")
 */
export async function fetchKaitoMindshare(handle: string): Promise<number | null> {
  const key = process.env.KAITO_API_KEY;
  const urlTemplate = process.env.KAITO_API_URL;
  if (!key || !urlTemplate) return null;
  const field = process.env.KAITO_FIELD ?? "mindshare";
  try {
    const url = urlTemplate.replace("{handle}", encodeURIComponent(norm(handle)));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const value = Number(pluck(json, field));
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  } catch {
    return null;
  }
}

export interface MindshareValue {
  mindshare: number;
  source: "x" | "kaito" | "engine";
}

/**
 * Current mindshare for a handle. When the caller has already resolved a value
 * from the organic X aggregator (the universe has to be normalized as a whole),
 * it passes it in as `override` and we trust it; otherwise we fall back to the
 * deterministic engine. Kept sync-simple: no network call on the default path.
 */
export function currentMindshare(
  handle: string,
  override: number | null = null,
): MindshareValue {
  if (override !== null && Number.isFinite(override)) {
    return { mindshare: override, source: "x" };
  }
  return { mindshare: engineMindshare(handle), source: "engine" };
}
