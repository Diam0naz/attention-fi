import { NextResponse } from "next/server";
import { runIndexerCrawl } from "@/lib/indexer";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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

  // `?full=1` re-scans from the tip regardless of the cursor. Needed because
  // the cursor advances over history the crawl didn't decode, so a decode
  // failure leaves a permanent hole no incremental run will ever revisit.
  // Bounded by maxPages like any other crawl, and idempotent — the event store
  // upserts on (signature, seq).
  const full = new URL(request.url).searchParams.get("full") === "1";

  try {
    const summary = await runIndexerCrawl(full ? { ignoreCursor: true, maxPages: 12 } : {});
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "crawl failed";
    return NextResponse.json({ indexed: 0, error: message }, { status: 500 });
  }
}
