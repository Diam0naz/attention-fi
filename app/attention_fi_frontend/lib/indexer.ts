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
  /** Transactions whose logs it read. */
  processed?: number;
  /** Transactions whose logs it couldn't read. Non-zero means RPC trouble,
   *  not a quiet program. */
  fetchFailed?: number;
  /** True when the crawl stopped early. Call again to continue from here. */
  truncated?: boolean;
}

export async function runIndexerCrawl(
  opts: { maxPages?: number; ignoreCursor?: boolean; budgetMs?: number } = {},
): Promise<CrawlSummary> {
  if (!indexerDbConfigured()) {
    return { indexed: 0, scanned: 0, newestSig: null, skipped: "no-db" };
  }
  const program = getReadonlyProgram();
  const stored = await getCursor();
  // `ignoreCursor` re-scans from the tip. Kept as an escape hatch: a cursor is
  // only ever as good as the runs that moved it, and a bad one is otherwise
  // unrecoverable from outside the database.
  const until = opts.ignoreCursor ? undefined : (stored ?? undefined);
  // Paging is one cheap call per 25 signatures and must reach `until`, so this
  // is a safety bound rather than a throughput setting; `budgetMs` limits the
  // expensive part.
  const maxPages = opts.maxPages ?? 40;
  const { rows, newestSig, scanned, processed, fetchFailed, truncated, contiguous } =
    await crawlProgramEvents(program, { until, maxPages, budgetMs: opts.budgetMs });
  if (rows.length > 0) await insertChainEvents(rows);
  // `newestSig` is the newest transaction actually read, so it's safe to store
  // even from a truncated run — that's what lets a long backlog finish across
  // several calls instead of restarting from the tip each time.
  //
  // Unless the run wasn't contiguous with the cursor, in which case storing it
  // would skip the hole in between for good.
  if (newestSig && contiguous) await setCursor(newestSig);
  // Otherwise record that a crawl ran anyway, so the opportunistic throttle
  // doesn't fire on every read while the RPC is unhappy and stampede it.
  else await touchCursor();
  return {
    indexed: rows.length,
    scanned,
    processed,
    newestSig,
    cursorBefore: stored,
    fetchFailed,
    truncated,
  };
}

/** Throttled, non-throwing crawl — safe to await before serving a read. */
export async function crawlIfStale(): Promise<void> {
  if (!indexerDbConfigured()) return;
  try {
    const age = await cursorAge();
    if (age !== null && age < MIN_CRAWL_INTERVAL_S) return;
    // A tight budget here on purpose: this runs *inside* a user-facing read,
    // so it must top up the tip and get out of the way. Backlogs are for
    // /api/indexer/crawl, which nobody is waiting on.
    await runIndexerCrawl({ budgetMs: 4_000 });
  } catch {
    // An opportunistic crawl must never fail the read that triggered it.
  }
}
