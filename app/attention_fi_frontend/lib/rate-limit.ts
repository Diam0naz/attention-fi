// Fixed-window rate limiting, backed by the same Postgres the routes already use.
//
// The obvious implementation — a Map in module scope — is wrong here twice
// over. Vercel runs each route in however many instances traffic warrants, so
// a per-instance counter caps at `limit x instances` and an attacker who
// spreads requests gets that multiplier for free. And Next's own proxy docs
// warn against relying on globals, because proxy is allowed to run outside the
// app runtime entirely. A shared counter has to live somewhere shared.
//
// Postgres is that somewhere, and it costs nothing extra: every route worth
// limiting here already opens a connection to do its real work. The limiter
// adds one indexed upsert in front of queries that were already going to run.
//
// Windows are fixed rather than sliding. A sliding window needs either a row
// per request or a sorted set; fixed windows need one row per caller per
// window and a single atomic statement. The known cost is burstiness at the
// boundary — a caller can spend a full budget at the end of one window and
// again at the start of the next. For abuse control that is fine; these limits
// exist to stop a script hammering an endpoint, not to meter a paid API.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("rate-limit: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

export function rateLimitConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists rate_limit (
        bucket text not null,
        window_start timestamptz not null,
        hits integer not null default 0,
        primary key (bucket, window_start)
      )`;
    // Sweeping by age is the only query that isn't a primary-key hit.
    await sql`
      create index if not exists rate_limit_window_idx
        on rate_limit (window_start)`;
  })().catch((e) => {
    // Don't cache a failed bootstrap: a cold Neon instance would otherwise
    // leave every later call convinced the table doesn't exist.
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowS: number;
};

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window rolls over. */
  resetAt: number;
};

/**
 * Budgets per route.
 *
 * Set from what a real person does, with enough headroom that nobody hits
 * these by using the app normally, then trips a script well before it costs
 * anything. The paid routes are tightest: each one costs the caller SOL, so a
 * legitimate wallet has no reason to run them in a loop.
 */
export const RULES = {
  /** Paying for a skin — a wallet signature and a transfer per call. */
  "skins:buy": { limit: 10, windowS: 60 },
  /** Applying a skin already owned; signature-gated but free. */
  "skins:wear": { limit: 30, windowS: 60 },
  /** Waitlist signup — the classic spam target, and unauthenticated. */
  waitlist: { limit: 5, windowS: 300 },
  /** Starting an X OAuth handshake. */
  "verify:start": { limit: 10, windowS: 300 },
  /** Indexer crawl: expensive, and nothing user-facing should call it fast. */
  "indexer:crawl": { limit: 4, windowS: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RuleName = keyof typeof RULES;

/**
 * Best-effort client identity.
 *
 * `x-forwarded-for` is a comma-separated chain and only the first entry is the
 * original client; the rest are proxies. It is spoofable in general, but on
 * Vercel the platform overwrites the leading entry, so behind that deployment
 * it is trustworthy.
 *
 * Deliberately not keyed on anything from the request body. A wallet address
 * in a payload is chosen by the caller, so budgeting per wallet would let an
 * attacker mint a fresh budget per request by changing one field — the exact
 * traffic this is meant to stop.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  return ip ? `i:${ip}` : "i:unknown";
}

/**
 * Count one request against a rule.
 *
 * Fails open. A limiter that returns 503 when its own store is unreachable
 * converts a Neon cold start into a site-wide outage, which is a worse
 * failure than briefly not limiting — and Neon suspending while idle is
 * routine here, not exceptional. The upside of an attack slipping through a
 * resume window is small; the downside of locking out every real user during
 * one is not.
 */
export async function rateLimit(
  rule: RuleName,
  key: string,
): Promise<RateLimitResult> {
  const { limit, windowS } = RULES[rule];
  const nowS = Math.floor(Date.now() / 1000);
  const startS = Math.floor(nowS / windowS) * windowS;
  const resetAt = startS + windowS;
  const bucket = `${rule}:${key}`;

  if (!rateLimitConfigured()) {
    return { ok: true, limit, remaining: limit, resetAt };
  }

  try {
    await ensureSchema();
    const windowStart = new Date(startS * 1000).toISOString();
    // One statement, so concurrent requests can't read-then-write past the
    // limit: the increment and the read of the new value are the same row lock.
    const rows = (await sql`
      insert into rate_limit (bucket, window_start, hits)
      values (${bucket}, ${windowStart}, 1)
      on conflict (bucket, window_start)
        do update set hits = rate_limit.hits + 1
      returning hits`) as { hits: number }[];

    const hits = rows[0]?.hits ?? 1;
    void sweep(windowS);
    return {
      ok: hits <= limit,
      limit,
      remaining: Math.max(0, limit - hits),
      resetAt,
    };
  } catch {
    return { ok: true, limit, remaining: limit, resetAt };
  }
}

/**
 * Drop windows nobody can be inside any more.
 *
 * Sampled rather than scheduled: this project has no cron, and a delete on
 * every request would double the limiter's write cost to remove rows that are
 * only a few bytes. At 2% the table stays bounded under any traffic that
 * matters, and the work lands on an arbitrary request rather than a queue.
 */
async function sweep(windowS: number): Promise<void> {
  if (Math.random() > 0.02) return;
  const cutoff = new Date((Date.now() - windowS * 4000)).toISOString();
  try {
    await sql`delete from rate_limit where window_start < ${cutoff}`;
  } catch {
    // Housekeeping; a failure here must never affect the caller.
  }
}

/**
 * Standard headers so a client can back off deliberately instead of guessing.
 */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(Math.max(0, r.resetAt - Math.floor(Date.now() / 1000))),
  };
  if (!r.ok) headers["Retry-After"] = headers["RateLimit-Reset"]!;
  return headers;
}

/**
 * The 429 a route should return when {@link rateLimit} says no.
 */
export function tooManyRequests(r: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests — slow down and try again shortly." },
    { status: 429, headers: rateLimitHeaders(r) },
  );
}
