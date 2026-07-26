// Light-indexer orchestrator: ties the chain crawler (lib/solana/events.ts) to
// the event store (lib/indexer-db.ts). runIndexerCrawl() advances the cursor and
// persists any new events; crawlIfStale() is the throttled, best-effort version
// safe to call on every activity read so the feed stays fresh without a cron
// (wire a cron to /api/indexer/crawl in production for steadier coverage).

import { getReadonlyProgram } from "@/lib/solana/program";
import { crawlProgramEvents } from "@/lib/solana/events";
import {
  cursorAge,
  getCursor,
  indexerDbConfigured,
  insertChainEvents,
  setCursor,
} from "@/lib/indexer-db";

/** Skip an opportunistic crawl if one ran within this window. */
const MIN_CRAWL_INTERVAL_S = 30;

export interface CrawlSummary {
  indexed: number;
  scanned: number;
  newestSig: string | null;
  skipped?: string;
}

export async function runIndexerCrawl(opts: { maxPages?: number } = {}): Promise<CrawlSummary> {
  if (!indexerDbConfigured()) {
    return { indexed: 0, scanned: 0, newestSig: null, skipped: "no-db" };
  }
  const program = getReadonlyProgram();
  const until = (await getCursor()) ?? undefined;
  // No cursor yet → backfill more history; incremental runs just chase the tip.
  const maxPages = opts.maxPages ?? (until ? 2 : 4);
  const { rows, newestSig, scanned } = await crawlProgramEvents(program, { until, maxPages });
  if (rows.length > 0) await insertChainEvents(rows);
  if (newestSig) await setCursor(newestSig);
  return { indexed: rows.length, scanned, newestSig };
}

/** Throttled, non-throwing crawl — safe to await before serving a read. */
export async function crawlIfStale(): Promise<void> {
  if (!indexerDbConfigured()) return;
  try {
    const age = await cursorAge();
    if (age !== null && age < MIN_CRAWL_INTERVAL_S) return;
    await runIndexerCrawl();
  } catch {
    // An opportunistic crawl must never fail the read that triggered it.
  }
}
