// Event-history store (Neon serverless) — the light indexer's persistence.
// The crawler (lib/solana/events.ts) decodes the program's on-chain events
// (launches, trades, graduations, AMM swaps, creator claims) from transaction
// logs and lands them here; the activity feed and analytics read from here so
// they never re-scan the chain per request. A cursor row remembers the newest
// signature indexed so each crawl only fetches what's new.
//
// When no DATABASE_URL is configured every helper no-ops / returns empty and
// callers fall back to the live chain read.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function indexerDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("indexer-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists chain_events (
        signature text not null,
        seq int not null,
        kind text not null,
        mint text,
        actor text,
        is_buy boolean,
        sol_lamports bigint,
        token_amount bigint,
        fee_lamports bigint,
        slot bigint,
        block_time bigint,
        primary key (signature, seq)
      )`;
    await sql`
      create index if not exists chain_events_time_idx
      on chain_events (block_time desc)`;
    await sql`
      create index if not exists chain_events_mint_time_idx
      on chain_events (mint, block_time desc)`;
    await sql`
      create table if not exists indexer_cursor (
        id int primary key,
        newest_sig text,
        updated_at timestamptz not null default now()
      )`;
  })().catch((e) => {
    schemaReady = null; // allow retry on transient failure
    throw e;
  });
  return schemaReady;
}

export interface ChainEventInsert {
  signature: string;
  seq: number;
  kind: string;
  mint: string | null;
  actor: string | null;
  isBuy: boolean | null;
  solLamports: bigint | null;
  tokenAmount: bigint | null;
  feeLamports: bigint | null;
  slot: number | null;
  blockTime: number | null;
}

export interface ActivityRow {
  signature: string;
  kind: string;
  mint: string | null;
  actor: string | null;
  isBuy: boolean | null;
  solLamports: bigint | null;
  tokenAmount: bigint | null;
  feeLamports: bigint | null;
  slot: number | null;
  blockTime: number | null;
}

const bstr = (v: bigint | null): string | null => (v === null ? null : v.toString());
const bnum = (v: string | number | null): bigint | null =>
  v === null || v === undefined ? null : BigInt(v);

/** Idempotent insert — replays of the same signature/seq are ignored. */
export async function insertChainEvents(rows: ChainEventInsert[]): Promise<void> {
  if (rows.length === 0) return;
  await ensureSchema();
  for (const r of rows) {
    await sql`
      insert into chain_events
        (signature, seq, kind, mint, actor, is_buy, sol_lamports, token_amount, fee_lamports, slot, block_time)
      values
        (${r.signature}, ${r.seq}, ${r.kind}, ${r.mint}, ${r.actor}, ${r.isBuy},
         ${bstr(r.solLamports)}, ${bstr(r.tokenAmount)}, ${bstr(r.feeLamports)}, ${r.slot}, ${r.blockTime})
      on conflict (signature, seq) do nothing`;
  }
}

interface RawRow {
  signature: string;
  kind: string;
  mint: string | null;
  actor: string | null;
  is_buy: boolean | null;
  sol_lamports: string | null;
  token_amount: string | null;
  fee_lamports: string | null;
  slot: string | null;
  block_time: string | null;
}

function toActivityRow(r: RawRow): ActivityRow {
  return {
    signature: r.signature,
    kind: r.kind,
    mint: r.mint,
    actor: r.actor,
    isBuy: r.is_buy,
    solLamports: bnum(r.sol_lamports),
    tokenAmount: bnum(r.token_amount),
    feeLamports: bnum(r.fee_lamports),
    slot: r.slot === null ? null : Number(r.slot),
    blockTime: r.block_time === null ? null : Number(r.block_time),
  };
}

export interface ActivityQuery {
  mint?: string;
  actor?: string;
  kinds?: string[];
  limit?: number;
}

/** Newest-first activity, optionally filtered by mint / actor / event kinds. */
export async function getActivity(q: ActivityQuery = {}): Promise<ActivityRow[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const kinds = q.kinds && q.kinds.length > 0 ? q.kinds : null;
  const rows = (await sql`
    select signature, kind, mint, actor, is_buy, sol_lamports, token_amount, fee_lamports, slot, block_time
    from chain_events
    where (${q.mint ?? null}::text is null or mint = ${q.mint ?? null})
      and (${q.actor ?? null}::text is null or actor = ${q.actor ?? null})
      and (${kinds}::text[] is null or kind = any(${kinds}))
    order by block_time desc nulls last, slot desc nulls last
    limit ${limit}`) as RawRow[];
  return rows.map(toActivityRow);
}

/** The newest signature indexed so far (cursor for incremental crawls). */
export async function getCursor(): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql`select newest_sig from indexer_cursor where id = 1`) as {
    newest_sig: string | null;
  }[];
  return rows[0]?.newest_sig ?? null;
}

export async function setCursor(sig: string): Promise<void> {
  await ensureSchema();
  await sql`
    insert into indexer_cursor (id, newest_sig, updated_at)
    values (1, ${sig}, now())
    on conflict (id) do update set newest_sig = ${sig}, updated_at = now()`;
}

/** Seconds since the cursor was last advanced, or null when never. */
export async function cursorAge(): Promise<number | null> {
  await ensureSchema();
  const rows = (await sql`
    select extract(epoch from (now() - updated_at)) as age
    from indexer_cursor where id = 1`) as { age: string | null }[];
  const age = rows[0]?.age;
  return age === null || age === undefined ? null : Number(age);
}
