// The light indexer's chain half: walk the program's recent transactions,
// decode its Anchor events from the log messages, and normalize them into the
// flat rows lib/indexer-db.ts persists. Reads only — never signs. Kept
// defensive about field casing and number types so a coder/IDL quirk degrades
// to a skipped event rather than a failed crawl.

import { EventParser, type Program } from "@anchor-lang/core";
import type { ConfirmedSignatureInfo } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { ChainEventInsert } from "@/lib/indexer-db";

export interface CrawlResult {
  rows: ChainEventInsert[];
  /**
   * Newest signature fully processed — safe to store as the next cursor.
   *
   * Deliberately not "newest signature seen". The cursor means "everything up
   * to here is indexed", so it may only advance over transactions actually
   * read.
   */
  newestSig: string | null;
  /** Signatures the crawl listed. */
  scanned: number;
  /** Transactions whose logs it read. */
  processed: number;
  /**
   * Transactions whose logs couldn't be fetched, after retries.
   *
   * Reported rather than swallowed. A crawl that reads 141 signatures, fails
   * every `getTransaction` behind a rate limit, and returns "0 events" is
   * indistinguishable from a program nobody has used — which is exactly how an
   * empty activity feed went unexplained.
   */
  fetchFailed: number;
  /**
   * Transactions the RPC answered for but had no logs — pruned or otherwise
   * gone. Permanently unreadable, so the crawl steps over them rather than
   * wedging; counted so a rising number is visible rather than silent.
   */
  unavailable: number;
  /** True when it stopped early (budget, an unreadable tx, or the page cap). */
  truncated: boolean;
  /**
   * Whether the signatures read run contiguously back to `until`.
   *
   * False means paging hit its cap before reaching the cursor, so what was
   * read is a window at the tip with a hole behind it. `newestSig` is then not
   * safe to store.
   */
  contiguous: boolean;
}

function b58(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "toBase58" in v && typeof v.toBase58 === "function") {
    return v.toBase58() as string;
  }
  return String(v);
}

function toBig(v: unknown): bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "object" && "toString" in v) {
    try {
      return BigInt(v.toString());
    } catch {
      return null;
    }
  }
  try {
    return BigInt(v as string | number);
  } catch {
    return null;
  }
}

const flag = (v: unknown): boolean => v === true;

/** Retries per getTransaction, and the first backoff step. */
const FETCH_RETRIES = 3;
const RETRY_BASE_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Read a field by any of its casings (Anchor coders vary snake/camel). */
function pick(d: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in d && d[k] !== undefined) return d[k];
  }
  return undefined;
}

interface Ctx {
  signature: string;
  seq: number;
  slot: number | null;
  blockTime: number | null;
}

/** Map one decoded event to a flat row, or null for events we don't index. */
function normalize(name: string, data: Record<string, unknown>, ctx: Ctx): ChainEventInsert | null {
  const base = {
    signature: ctx.signature,
    seq: ctx.seq,
    slot: ctx.slot,
    blockTime: ctx.blockTime,
    mint: b58(pick(data, "mint")),
  };
  switch (name) {
    case "TradeEvent":
      return {
        ...base,
        kind: "trade",
        actor: b58(pick(data, "user")),
        isBuy: flag(pick(data, "isBuy", "is_buy")),
        solLamports: toBig(pick(data, "solAmount", "sol_amount")),
        tokenAmount: toBig(pick(data, "tokenAmount", "token_amount")),
        feeLamports: toBig(pick(data, "fee")),
      };
    case "LaunchEvent":
      return {
        ...base,
        kind: "launch",
        actor: b58(pick(data, "creator")),
        isBuy: null,
        solLamports: toBig(pick(data, "virtualSolReserves", "virtual_sol_reserves")),
        tokenAmount: null,
        feeLamports: null,
      };
    case "GraduateEvent":
      return {
        ...base,
        kind: "graduate",
        actor: null,
        isBuy: null,
        solLamports: toBig(pick(data, "realSolReserves", "real_sol_reserves")),
        tokenAmount: toBig(pick(data, "realTokenReserves", "real_token_reserves")),
        feeLamports: null,
      };
    case "AmmSwapEvent": {
      const isBuy = flag(pick(data, "isBuy", "is_buy"));
      const amountIn = toBig(pick(data, "amountIn", "amount_in"));
      const amountOut = toBig(pick(data, "amountOut", "amount_out"));
      return {
        ...base,
        kind: "swap",
        actor: b58(pick(data, "trader")),
        isBuy,
        // SOL is in on a buy, out on a sell; tokens are the mirror.
        solLamports: isBuy ? amountIn : amountOut,
        tokenAmount: isBuy ? amountOut : amountIn,
        feeLamports: null,
      };
    }
    // NFT events key off `asset`, not `mint`. Storing it in the mint column
    // keeps ?mint= filtering working for a 1-of-1; the token-registry join
    // simply misses, which is correct — an asset isn't a launched token.
    case "NftAuctionEvent": {
      const sold = Number(pick(data, "outcome") ?? 0) === 0;
      return {
        ...base,
        mint: b58(pick(data, "asset")),
        kind: sold ? "nft_sale" : "nft_reclaim",
        // The counterparty is who acted on the listing: the buyer on a sale,
        // and the lister themselves on a reclaim.
        actor: b58(pick(data, "counterparty")),
        isBuy: sold ? true : null,
        solLamports: toBig(pick(data, "price")),
        tokenAmount: null,
        feeLamports: toBig(pick(data, "fee")),
      };
    }
    case "NftListedEvent":
      return {
        ...base,
        mint: b58(pick(data, "asset")),
        kind: "nft_listed",
        actor: b58(pick(data, "creator")),
        isBuy: null,
        solLamports: toBig(pick(data, "startPrice", "start_price")),
        tokenAmount: null,
        feeLamports: null,
      };
    case "CreatorClaimEvent":
      return {
        ...base,
        kind: "claim",
        actor: b58(pick(data, "creator")),
        isBuy: null,
        solLamports: toBig(pick(data, "amount")),
        tokenAmount: null,
        feeLamports: null,
      };
    case "PoolCreatedEvent":
      return {
        ...base,
        kind: "pool",
        actor: null,
        isBuy: null,
        solLamports: toBig(pick(data, "solReserves", "sol_reserves")),
        tokenAmount: toBig(pick(data, "tokenReserves", "token_reserves")),
        feeLamports: null,
      };
    default:
      return null;
  }
}

export interface CrawlOptions {
  /** Stop once this signature is reached (the last-indexed cursor). */
  until?: string;
  /**
   * Safety bound on signature pages, not a throughput dial.
   *
   * Listing signatures is one RPC call per page and cheap; reading each
   * transaction is the expensive part, and that is what `budgetMs` limits.
   * Paging must run all the way back to `until` or the window it returns is
   * anchored at the tip rather than at the cursor — see the note on the
   * function below.
   */
  maxPages?: number;
  pageSize?: number;
  /**
   * Wall-clock budget for the transaction reads, in milliseconds.
   *
   * A crawl runs inside a serverless invocation with a hard ceiling, and one
   * `getTransaction` per signature is slow enough that a backlog cannot finish
   * in a single run. Rather than being killed mid-flight and losing everything,
   * the crawl stops cleanly and reports how far it got.
   */
  budgetMs?: number;
}

/**
 * Crawl the program's transactions newer than `until`, decoding every event
 * into flat rows.
 *
 * Signatures arrive newest-first but are processed **oldest-first**, so that
 * `newestSig` can mean "everything up to here is indexed" rather than "here is
 * the tip we saw". That is what makes an interrupted crawl resumable: whatever
 * it finished stays finished, and the next run starts from the first thing it
 * didn't reach. Advancing to the tip regardless turns any gap into a permanent
 * one.
 *
 * That guarantee depends entirely on paging reaching `until`. `until` does not
 * mean "start here" — the RPC always begins at the tip and walks backward
 * toward it, so a page limit that stops short returns a window anchored at the
 * *newest* end. Processing that window oldest-first then sets the cursor near
 * the tip and silently abandons everything between it and the old cursor.
 * Which is precisely what happened: a 2-page limit against a 141-signature
 * history walked the cursor to the tip having indexed nothing at all, and every
 * later run correctly reported "nothing new" over an empty table.
 *
 * So paging runs to completion and only the transaction reads are budgeted.
 * When even paging is cut short, the gap is real and the cursor must not move
 * past it.
 */
export async function crawlProgramEvents(
  program: Program<AttentionFi>,
  opts: CrawlOptions = {},
): Promise<CrawlResult> {
  const { until, maxPages = 40, pageSize = 25, budgetMs = 20_000 } = opts;
  const { connection } = program.provider;
  const programId = program.programId;
  const parser = new EventParser(programId, program.coder);
  const deadline = Date.now() + budgetMs;

  const sigInfos: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  // True when paging stopped at the page cap rather than at `until` or the end
  // of history — meaning the oldest signature held is *not* contiguous with the
  // cursor, and advancing past it would skip whatever lies between.
  let pagingIncomplete = false;
  for (let page = 0; ; page++) {
    if (page >= maxPages) {
      pagingIncomplete = true;
      break;
    }
    const batch = await connection.getSignaturesForAddress(
      programId,
      { until, before, limit: pageSize },
      "confirmed",
    );
    if (batch.length === 0) break;
    sigInfos.push(...batch);
    before = batch[batch.length - 1]!.signature;
    // A short page means the RPC ran out of history or hit `until`; either way
    // there is nothing older to fetch.
    if (batch.length < pageSize) break;
  }

  const rows: ChainEventInsert[] = [];
  let fetchFailed = 0;
  let unavailable = 0;
  let processed = 0;
  // The newest signature whose logs we actually read. Stays null until one
  // succeeds, so a crawl that reads nothing advances nothing.
  let newestSig: string | null = null;
  let truncated = false;

  for (const info of [...sigInfos].reverse()) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    // A failed transaction emitted no events, and skipping it is not a gap.
    if (info.err) {
      newestSig = info.signature;
      continue;
    }

    let logs: string[] | null | undefined;
    let slot = info.slot;
    let blockTime = info.blockTime ?? null;

    // Retry with backoff. One getTransaction per signature is a lot of calls in
    // a row, and public RPCs rate-limit long before a crawl of any size
    // finishes; a single attempt means most of a backlog is silently dropped.
    // "Not found" and "the RPC refused" are different answers and must not be
    // conflated. A pruned or unavailable transaction is permanent: skipping it
    // is the only way forward, and stopping would wedge the indexer on it for
    // good. A refusal is transient: stopping is right, because continuing past
    // it and then advancing the cursor is how history gets lost.
    let attempt = 0;
    let refused = false;
    for (;;) {
      try {
        const tx = await connection.getTransaction(info.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        logs = tx?.meta?.logMessages ?? null;
        slot = tx?.slot ?? slot;
        blockTime = tx?.blockTime ?? blockTime;
        break;
      } catch {
        attempt++;
        if (attempt > FETCH_RETRIES) {
          refused = true;
          break;
        }
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }
    if (refused) {
      fetchFailed++;
      truncated = true;
      break;
    }
    if (!logs) {
      // Answered, with nothing to decode. Nothing is lost by moving on.
      unavailable++;
      newestSig = info.signature;
      continue;
    }

    let seq = 0;
    try {
      for (const ev of parser.parseLogs(logs)) {
        const row = normalize(ev.name, ev.data as Record<string, unknown>, {
          signature: info.signature,
          seq,
          slot: slot ?? null,
          blockTime,
        });
        if (row) {
          rows.push(row);
          seq++;
        }
      }
    } catch {
      // Undecodable logs for this tx — the transaction was still read, so it
      // isn't a gap; keep going and let the cursor pass it.
    }
    newestSig = info.signature;
    processed++;
  }

  return {
    rows,
    newestSig,
    scanned: sigInfos.length,
    fetchFailed,
    unavailable,
    processed,
    truncated: truncated || pagingIncomplete,
    // A gap makes every signature held non-contiguous with the cursor, so the
    // caller must not advance it — the alternative is skipping history it can
    // never come back for.
    contiguous: !pagingIncomplete,
  };
}
