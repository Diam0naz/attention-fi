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

async function countFor(handle: string): Promise<number | null> {
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
    const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
    const casts = body.result?.casts ?? [];
    let n = 0;
    for (const c of casts) {
      const t = c.timestamp ? Date.parse(c.timestamp) : Number.NaN;
      if (Number.isNaN(t) || t >= cutoff) n++;
    }
    return n;
  } catch (e) {
    console.log(`  ${handle.padEnd(16)} ERROR — ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`Neynar cast search — casts in the last ${WINDOW_DAYS}d (first page, max 100)\n`);
  const counts: { handle: string; n: number }[] = [];
  for (const h of handles) {
    const n = await countFor(h);
    if (n !== null) {
      console.log(`  ${h.padEnd(16)} ${String(n).padStart(4)} casts`);
      counts.push({ handle: h, n });
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
    "\nNote: counts saturate at 100/page (the aggregator pages twice, so 200).\n" +
      "That cap applies to every handle equally, so relative shares stay meaningful.\n" +
      "To enable: set NEYNAR_API_KEY, and MINDSHARE_SOURCE=farcaster to pin the source.",
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Keep this file a module so its top-level names don't collide with the other
// standalone scripts in this directory.
export {};
