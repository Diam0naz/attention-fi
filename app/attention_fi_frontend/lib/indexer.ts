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
  touchCursor,
} from "@/lib/indexer-db";

/** Skip an opportunistic crawl if one ran within this window. */
const MIN_CRAWL_INTERVAL_S = 30;

export interface CrawlSummary {
  indexed: number;
  scanned: number;
  newestSig: string | null;
  skipped?: string;
  /** The cursor the crawl started from, so an empty result is explicable. */
  cursorBefore?: string | null;
  /** Transactions whose logs couldn't be read. Non-zero means RPC trouble,
   *  not a quiet program. */
  fetchFailed?: number;
}

export async function runIndexerCrawl(
  opts: { maxPages?: number; ignoreCursor?: boolean } = {},
): Promise<CrawlSummary> {
  if (!indexerDbConfigured()) {
    return { indexed: 0, scanned: 0, newestSig: null, skipped: "no-db" };
  }
  const program = getReadonlyProgram();
  const stored = await getCursor();
  // The cursor advances whenever the crawl sees signatures, whether or not any
  // of them decoded into events — which is right for the normal case (plenty of
  // the program's transactions emit nothing we index) and wrong for the one
  // that bites: if decoding was broken during a crawl, that history is skipped
  // permanently and every later run correctly reports "nothing new" over an
  // empty table. `ignoreCursor` is the way back.
  const until = opts.ignoreCursor ? undefined : (stored ?? undefined);
  // No cursor → backfill more history; incremental runs just chase the tip.
  const maxPages = opts.maxPages ?? (until ? 2 : 8);
  const { rows, newestSig, scanned, fetchFailed } = await crawlProgramEvents(program, {
    until,
    maxPages,
  });
  if (rows.length > 0) await insertChainEvents(rows);
  // Only advance the cursor when the crawl actually read what it scanned.
  // Advancing past transactions we couldn't fetch is what buried this: the
  // history is skipped, and the next run reports "nothing new" forever.
  if (newestSig && fetchFailed === 0) await setCursor(newestSig);
  // Either way, record that a crawl just ran, so the opportunistic throttle
  // doesn't fire on every read while the RPC is unhappy.
  else await touchCursor();
  return { indexed: rows.length, scanned, newestSig, cursorBefore: stored, fetchFailed };
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
