/**
 * Probe which X API v2 endpoints your bearer token's access tier actually
 * allows. Run this BEFORE committing to a paid tier — the organic mindshare
 * aggregator's preferred endpoint (recent tweet counts) is not available on
 * every plan, and a 403 there is the difference between real X data and the
 * deterministic engine fallback.
 *
 * Run from this directory (it resolves against the frontend's node_modules):
 *   cd app/attention_fi_frontend
 *   npx tsx scripts/check-x-access.ts [handle]
 *
 * Reads X_BEARER_TOKEN from the environment, falling back to .env so a token
 * already configured for the app just works.
 *
 * Reports, per endpoint: OK (usable), FORBIDDEN (tier doesn't include it),
 * RATE-LIMITED (usable, just throttled right now), or the raw failure.
 */

// Pick up .env when the var isn't already exported (Node 22 built-in).
if (!process.env.X_BEARER_TOKEN) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env — the explicit-token path below still works
  }
}

const TOKEN = process.env.X_BEARER_TOKEN;
if (!TOKEN) {
  console.error("error: X_BEARER_TOKEN is required");
  process.exit(1);
}

const handle = (process.argv[2] ?? "solana").replace(/^@/, "").toLowerCase();

interface Probe {
  label: string;
  url: string;
  /** What the aggregator can do if this endpoint is available. */
  note: string;
}

const PROBES: Probe[] = [
  {
    label: "tweets/counts/recent",
    url: `https://api.x.com/2/tweets/counts/recent?query=${encodeURIComponent(
      `(@${handle} OR from:${handle}) -is:retweet`,
    )}&granularity=day`,
    note: "PREFERRED — exact conversation volume in 1 request per handle",
  },
  {
    label: "tweets/search/recent",
    url: `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(
      `(@${handle} OR from:${handle}) -is:retweet`,
    )}&max_results=10`,
    note: "FALLBACK — count returned results (consumes monthly read quota)",
  },
  {
    label: "users/by/username",
    url: `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`,
    note: "CHEAPEST — follower/tweet counts; a coarser attention proxy",
  },
];

const TIMEOUT_MS = 20_000;

/** One attempt, retried once — a cold-start timeout shouldn't read as a denial. */
async function request(url: string, attempt = 0): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (attempt === 0) return request(url, 1);
    throw e;
  }
}

async function probe(p: Probe): Promise<void> {
  try {
    const res = await request(p.url);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    let verdict: string;
    if (res.ok) verdict = "OK";
    else if (res.status === 402) verdict = "NO CREDITS (token valid, balance 0)";
    else if (res.status === 403) verdict = "FORBIDDEN (not in your tier)";
    else if (res.status === 429) verdict = "RATE-LIMITED (usable, throttled now)";
    else if (res.status === 401) verdict = "UNAUTHORIZED (bad/expired token)";
    else verdict = `HTTP ${res.status}`;

    console.log(`\n${verdict.padEnd(30)} ${p.label}`);
    console.log(`  ${p.note}`);
    if (res.ok) {
      const meta = body.meta as { total_tweet_count?: number; result_count?: number } | undefined;
      const data = body.data as { public_metrics?: Record<string, number> } | undefined;
      if (meta?.total_tweet_count !== undefined) {
        console.log(`  -> 7d conversation volume for @${handle}: ${meta.total_tweet_count}`);
      } else if (meta?.result_count !== undefined) {
        console.log(`  -> returned ${meta.result_count} recent posts`);
      } else if (data?.public_metrics) {
        console.log(`  -> public_metrics: ${JSON.stringify(data.public_metrics)}`);
      }
    } else if (typeof body.detail === "string") {
      console.log(`  -> ${body.detail}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = /abort|timeout/i.test(msg);
    console.log(`\n${(timedOut ? "TIMEOUT (network, not tier)" : "ERROR").padEnd(30)} ${p.label}`);
    console.log(`  ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log(`Probing X API v2 access for @${handle} ...`);
  for (const p of PROBES) await probe(p);
  console.log(
    "\nReading the results:\n" +
      "  OK          -> lib/x-mindshare.ts can use it. If counts/recent is FORBIDDEN\n" +
      "                 but a cheaper one is OK, the aggregator can be repointed --\n" +
      "                 the /api/mindshare JSON shape is unchanged, so no feed or\n" +
      "                 on-chain change is needed.\n" +
      "  NO CREDITS  -> not a tier problem and NOT fixable by switching endpoints:\n" +
      "                 every v2 read draws on the same credit balance. Top up the\n" +
      "                 X API account, or stay on the deterministic engine.\n" +
      "  FORBIDDEN   -> your plan excludes that endpoint; try a cheaper one above.",
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Keep this file a module so its top-level names don't collide with the other
// standalone scripts in this directory.
export {};
