import { NextResponse } from "next/server";
import { runIndexerCrawl } from "@/lib/indexer";

export const dynamic = "force-dynamic";

/**
 * Advance the event indexer: crawl the program's new transactions, decode their
 * events, and persist them. Reads the chain server-side (clients only trigger).
 * Wire a cron here in production; the activity feed also crawls opportunistically.
 */
export async function GET() {
  try {
    const summary = await runIndexerCrawl();
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "crawl failed";
    return NextResponse.json({ indexed: 0, error: message }, { status: 500 });
  }
}
