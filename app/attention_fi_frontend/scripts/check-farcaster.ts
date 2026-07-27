/**
 * Verify a Neynar API key works and preview what the Farcaster aggregator would
 * actually measure — real cast volume per handle and the resulting mindshare
 * shares — before wiring it into /api/mindshare or an on-chain feed.
 *
 * Run from this directory (resolves against the frontend's node_modules):
 *   cd app/attention_fi_frontend
 *   npx tsx scripts/check-farcaster.ts [handle ...]
 *
 * Reads NEYNAR_API_KEY from the environment, falling back to .env.
 * With no handles given, samples a few from the curated universe.
 */

if (!process.env.NEYNAR_API_KEY) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env — the explicit-env path still works
  }
}

const RAW_KEY = process.env.NEYNAR_API_KEY;
if (!RAW_KEY) {
  console.error(
    "error: NEYNAR_API_KEY is required (get a free key at https://dev.neynar.com)",
  );
  process.exit(1);
}
const KEY: string = RAW_KEY;

const SEARCH_URL = "https://api.neynar.com/v2/farcaster/cast/search";
const WINDOW_DAYS = 7;

const handles =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((h) => h.replace(/^@/, "").toLowerCase())
    : ["solana", "base", "vitalik", "jessepollak"];

interface CastSearchResponse {
  result?: { casts?: { timestamp?: string }[] };
  message?: string;
}

interface Measured {
  raw: number;
  projected: number;
  saturated: boolean;
  spanHours: number;
}

async function countFor(handle: string): Promise<Measured | null> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", handle);
  url.searchParams.set("limit", "100");
  url.searchParams.set("sort_type", "desc_chron");
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as CastSearchResponse;
    if (!res.ok) {
      const detail = body.message ? ` — ${body.message}` : "";
      console.log(
        `  ${handle.padEnd(16)} HTTP ${res.status}${
          res.status === 401 ? " (bad key)" : res.status === 429 ? " (rate limited)" : ""
        }${detail}`,
      );
      return null;
    }
    const now = Date.now();
    const windowMs = WINDOW_DAYS * 86_400_000;
    const cutoff = now - windowMs;
    const casts = body.result?.casts ?? [];
    let n = 0;
    let oldest = now;
    let crossed = false;
    for (const c of casts) {
      const t = c.timestamp ? Date.parse(c.timestamp) : Number.NaN;
      if (Number.isNaN(t)) {
        n++;
        continue;
      }
      if (t < cutoff) {
        crossed = true;
        break;
      }
      n++;
      if (t < oldest) oldest = t;
    }
    // Saturated (a full page, still inside the window) → the raw count is a
    // floor. Project the observed rate over the window, as the aggregator does.
    const saturated = !crossed && casts.length >= 100;
    const spanMs = Math.max(now - oldest, 60_000);
    const projected = saturated && spanMs < windowMs ? Math.round((n / spanMs) * windowMs) : n;
    return { raw: n, projected, saturated, spanHours: spanMs / 3_600_000 };
  } catch (e) {
    console.log(`  ${handle.padEnd(16)} ERROR — ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Resolve a handle to an FID via the snapchain username proof. */
async function fidFor(handle: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://snapchain-api.neynar.com/v1/userNameProofByName?name=${encodeURIComponent(handle)}`,
      { headers: { "x-api-key": KEY, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { fid?: number };
    return typeof body.fid === "number" && body.fid > 0 ? body.fid : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`Neynar cast search — casts in the last ${WINDOW_DAYS}d (first page, max 100)\n`);
  const counts: { handle: string; n: number }[] = [];
  for (const h of handles) {
    const m = await countFor(h);
    if (m !== null) {
      const fid = await fidFor(h);
      const id = fid === null ? "no Farcaster account" : `fid ${fid}`;
      const sat = m.saturated
        ? `  SATURATED: ${m.raw} in ${m.spanHours.toFixed(1)}h -> ~${m.projected}/${WINDOW_DAYS}d`
        : "";
      console.log(`  ${h.padEnd(16)} ${String(m.raw).padStart(4)} casts   (${id})${sat}`);
      counts.push({ handle: h, n: m.projected });
    }
  }
  if (counts.length === 0) {
    console.log("\nNo handle returned data — the key or plan is the problem, not the query.");
    process.exit(1);
  }
  const total = counts.reduce((s, c) => s + c.n, 0);
  console.log(`\nResulting mindshare (share of this sample's ${total} casts):`);
  for (const c of [...counts].sort((a, b) => b.n - a.n)) {
    const pct = total > 0 ? (c.n / total) * 100 : 0;
    console.log(`  ${c.handle.padEnd(16)} ${pct.toFixed(2)}%`);
  }
  console.log(
    "\nA full page inside the window means the raw count is a FLOOR, not a\n" +
      "measurement — two saturated handles would otherwise tie artificially.\n" +
      "Shares above use the rate-projected volume instead (rate = casts/span).\n" +
      "To enable: set NEYNAR_API_KEY, and MINDSHARE_SOURCE=farcaster to pin it.",
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Keep this file a module so its top-level names don't collide with the other
// standalone scripts in this directory.
export {};
