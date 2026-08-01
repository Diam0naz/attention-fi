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

  try {
    const summary = await runIndexerCrawl();
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "crawl failed";
    return NextResponse.json({ indexed: 0, error: message }, { status: 500 });
  }
}
