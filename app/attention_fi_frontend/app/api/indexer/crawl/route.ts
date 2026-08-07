import { NextResponse } from "next/server";
import { runIndexerCrawl } from "@/lib/indexer";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
/** Serverless ceiling for this route. The crawl's own budget sits under it. */
export const maxDuration = 60;

/**
 * Wall-clock budget for the crawl itself, comfortably inside `maxDuration`.
 *
 * The gap matters: a crawl killed by the platform loses everything it did,
 * including the cursor advance, so a backlog would restart from the tip on
 * every call and never finish. Stopping under its own power keeps the progress.
 */
const BUDGET_MS = 45_000;

/**
 * Advance the event indexer: crawl the program's new transactions, decode their
 * events, and persist them. Reads the chain server-side (clients only trigger).
 * Wire a cron here in production; the activity feed also crawls opportunistically.
 */
export async function GET(request: Request) {
  // Anyone can trigger this and each call fans out into RPC history reads, so
  // it's the cheapest request in the app to send and among the dearest to
  // serve. The budget is well above what the opportunistic feed crawl needs.
  const limited = await rateLimit("indexer:crawl", clientKey(request));
  if (!limited.ok) return tooManyRequests(limited);

  // `?full=1` re-scans from the tip regardless of the cursor — the escape
  // hatch for a cursor that got ahead of what was actually indexed. Idempotent:
  // the event store upserts on (signature, seq).
  //
  // A run may return `truncated: true`, meaning it stopped on its budget with
  // more to do. Call again; it resumes from where it got to.
  const full = new URL(request.url).searchParams.get("full") === "1";

  try {
    const summary = await runIndexerCrawl(
      full ? { ignoreCursor: true, maxPages: 12, budgetMs: BUDGET_MS } : { budgetMs: BUDGET_MS },
    );
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "crawl failed";
    return NextResponse.json({ indexed: 0, error: message }, { status: 500 });
  }
}
