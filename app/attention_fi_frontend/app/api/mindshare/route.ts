import { NextResponse, type NextRequest } from "next/server";
import { ALL_TOKENS, LIVE_HANDLES } from "@/lib/mock-data";
import {
  currentMindshare,
  curatedVertical,
  engineMindshare,
  norm,
} from "@/lib/mindshare-engine";
import { resolveUniverseMindshare } from "@/lib/mindshare-sources";
import {
  getHistory,
  getLatestAll,
  getValueAround,
  insertMindshare,
  mindshareDbConfigured,
  newestAgeForHandle,
} from "@/lib/mindshare-db";
import { allTokens, tokenDbConfigured } from "@/lib/token-db";

export const dynamic = "force-dynamic";

/** Don't rewrite a handle's history more often than this. */
const WRITE_INTERVAL_S = 300;
const HOUR = 3600;

/** Every handle the app knows: curated catalog + tokens launched on-chain. */
async function universe(): Promise<{ handle: string; vertical: string }[]> {
  const map = new Map<string, { handle: string; vertical: string }>();
  for (const t of ALL_TOKENS) {
    const h = norm(t.handle);
    if (!map.has(h)) map.set(h, { handle: h, vertical: t.vertical });
  }
  if (tokenDbConfigured()) {
    try {
      for (const t of await allTokens()) {
        const h = norm(t.handle);
        if (!map.has(h)) map.set(h, { handle: h, vertical: curatedVertical(h) });
      }
    } catch {
      // DB unreachable — curated universe is enough
    }
  }
  return [...map.values()];
}

/** Synthetic 24-point sparkline from the engine, for handles without history. */
function syntheticSpark(handle: string): number[] {
  const now = Date.now();
  const out: number[] = [];
  for (let i = 23; i >= 0; i--) out.push(engineMindshare(handle, now - i * HOUR * 1000));
  return out;
}

function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(values[Math.floor((i * (values.length - 1)) / (n - 1))]!);
  return out;
}

async function deltaAndSpark(
  handle: string,
  current: number,
): Promise<{ delta24h: number; sparkline: number[] }> {
  const now = Math.floor(Date.now() / 1000);
  let sparkline: number[] = [];
  let past: number | null = null;
  if (mindshareDbConfigured()) {
    try {
      const hist = await getHistory(handle, now - 24 * HOUR, now);
      if (hist.length >= 8) sparkline = downsample(hist.map((p) => p.mindshare), 24);
      past = await getValueAround(handle, now - 24 * HOUR);
    } catch {
      // fall through to synthetic
    }
  }
  if (sparkline.length < 8) sparkline = syntheticSpark(handle);
  if (past === null) past = engineMindshare(handle, Date.now() - 24 * HOUR * 1000);
  const delta24h = past > 0 ? Math.round(((current - past) / past) * 1000) / 10 : 0;
  return { delta24h, sparkline };
}

/**
 * Rank of `value` within the universe. Orders by the same source the value came
 * from: the organic X map when present (so a handle's number and its rank agree),
 * else the engine.
 */
function rankOf(
  handle: string,
  value: number,
  all: { handle: string }[],
  valueOf: (h: string) => number,
): number {
  let above = 0;
  for (const u of all) {
    if (u.handle === handle) continue;
    if (valueOf(u.handle) > value) above++;
  }
  return above + 1;
}

async function writeIfStale(row: {
  handle: string;
  mindshare: number;
  rank: number;
  vertical: string;
  source: string;
  ageSec: number | null;
}): Promise<void> {
  if (!mindshareDbConfigured()) return;
  if (row.ageSec !== null && row.ageSec < WRITE_INTERVAL_S) return;
  try {
    await insertMindshare([
      { handle: row.handle, mindshare: row.mindshare, rank: row.rank, vertical: row.vertical, source: row.source },
    ]);
  } catch {
    // best-effort history; never fail the read on a write error
  }
}

export async function GET(req: NextRequest) {
  const handleParam = req.nextUrl.searchParams.get("handle");
  const all = await universe();

  // Sweep ONLY the handles backed by real accounts. Mindshare is a share of a
  // normalized set, so folding illustrative handles (which measure zero) into
  // the same normalization would push every one of them to the 0.01% floor and
  // collapse its tier. Measured handles are normalized among themselves;
  // everything else keeps its engine value below.
  const { map: liveMap, source: liveSource } = await resolveUniverseMindshare(
    all.map((u) => u.handle).filter((h) => LIVE_HANDLES.has(h)),
  );
  const valueOf = (h: string): number => liveMap?.get(h) ?? engineMindshare(h);

  // Single handle → rich record. Top-level `mindshare` is what the Switchboard
  // job parses ($.mindshare), so this same endpoint feeds both UI and oracle.
  if (handleParam) {
    const handle = norm(handleParam);
    const { mindshare, source } = currentMindshare(
      handle,
      liveMap?.get(handle) ?? null,
      liveSource,
    );
    const rank = rankOf(handle, mindshare, all, valueOf);
    const vertical = curatedVertical(handle);
    const { delta24h, sparkline } = await deltaAndSpark(handle, mindshare);
    const ageSec = mindshareDbConfigured() ? await newestAgeForHandle(handle).catch(() => null) : null;
    await writeIfStale({ handle, mindshare, rank, vertical, source, ageSec });
    return NextResponse.json({ handle, mindshare, source, rank, delta24h, sparkline, vertical });
  }

  // Leaderboard → one row per known handle, ranked. Deltas from the engine to
  // keep the list cheap; the per-handle endpoint gives DB-backed deltas.
  const ages = new Map<string, number>();
  if (mindshareDbConfigured()) {
    try {
      for (const l of await getLatestAll()) ages.set(l.handle, l.ageSec);
    } catch {
      // no ages → treat all as writable this pass
    }
  }
  const rows = all.map(({ handle, vertical }) => {
    const { mindshare, source } = currentMindshare(
      handle,
      liveMap?.get(handle) ?? null,
      liveSource,
    );
    return { handle, mindshare, source, vertical };
  });
  rows.sort((a, b) => b.mindshare - a.mindshare);
  const tokens = rows.map((r, i) => {
    const past = engineMindshare(r.handle, Date.now() - 24 * HOUR * 1000);
    const delta24h = past > 0 ? Math.round(((r.mindshare - past) / past) * 1000) / 10 : 0;
    return { ...r, rank: i + 1, delta24h };
  });
  // Persist history for any stale handles (throttled), best-effort.
  await Promise.all(
    tokens.map((t) =>
      writeIfStale({
        handle: t.handle,
        mindshare: t.mindshare,
        rank: t.rank,
        vertical: t.vertical,
        source: t.source,
        ageSec: ages.get(t.handle) ?? null,
      }),
    ),
  );
  return NextResponse.json({ tokens, count: tokens.length });
}
