// Mindshare history store (Neon serverless). Attention is the substance
// AttentionFi trades on, so its history has to persist: deltas, sparklines,
// and rankings all read from here, and the same latest value is what the
// Switchboard oracle publishes on-chain. When no DATABASE_URL is configured
// the helpers no-op / return empty and callers fall back to the live compute.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function mindshareDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("mindshare-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists mindshare_snapshots (
        id bigint generated always as identity primary key,
        handle text not null,
        mindshare double precision not null,
        rank int,
        vertical text,
        source text,
        taken_at timestamptz not null default now()
      )`;
    await sql`
      create index if not exists mindshare_handle_time_idx
      on mindshare_snapshots (handle, taken_at)`;
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

export interface MindshareInsert {
  handle: string;
  mindshare: number;
  rank?: number | null;
  vertical?: string | null;
  source?: string | null;
}

export async function insertMindshare(rows: MindshareInsert[]): Promise<void> {
  if (rows.length === 0) return;
  await ensureSchema();
  for (const r of rows) {
    await sql`
      insert into mindshare_snapshots (handle, mindshare, rank, vertical, source)
      values (${r.handle}, ${r.mindshare}, ${r.rank ?? null}, ${r.vertical ?? null}, ${r.source ?? null})`;
  }
}

/** Age in seconds of the newest snapshot for a handle, or null when none. */
export async function newestAgeForHandle(handle: string): Promise<number | null> {
  await ensureSchema();
  const rows = (await sql`
    select extract(epoch from (now() - max(taken_at))) as age
    from mindshare_snapshots where handle = ${handle}`) as { age: string | null }[];
  const age = rows[0]?.age;
  return age === null || age === undefined ? null : Number(age);
}

export interface MindsharePoint {
  time: number; // epoch seconds
  mindshare: number;
}

/** History for a handle over a window, oldest → newest (for sparklines/deltas). */
export async function getHistory(
  handle: string,
  fromEpoch: number,
  toEpoch: number,
): Promise<MindsharePoint[]> {
  await ensureSchema();
  const rows = (await sql`
    select extract(epoch from taken_at) as time, mindshare
    from mindshare_snapshots
    where handle = ${handle}
      and taken_at >= to_timestamp(${fromEpoch})
      and taken_at <= to_timestamp(${toEpoch})
    order by taken_at asc
    limit 5000`) as { time: string; mindshare: number }[];
  return rows.map((r) => ({ time: Math.floor(Number(r.time)), mindshare: r.mindshare }));
}

/** The stored value closest to `targetEpoch` for a handle (for 24h deltas). */
export async function getValueAround(handle: string, targetEpoch: number): Promise<number | null> {
  await ensureSchema();
  const rows = (await sql`
    select mindshare from mindshare_snapshots
    where handle = ${handle}
    order by abs(extract(epoch from taken_at) - ${targetEpoch}) asc
    limit 1`) as { mindshare: number }[];
  return rows[0]?.mindshare ?? null;
}

export interface LatestMindshare {
  handle: string;
  mindshare: number;
  vertical: string | null;
  ageSec: number;
}

/** Latest snapshot per handle (for the leaderboard + write-freshness checks). */
export async function getLatestAll(): Promise<LatestMindshare[]> {
  await ensureSchema();
  const rows = (await sql`
    select distinct on (handle)
      handle, mindshare, vertical,
      extract(epoch from (now() - taken_at)) as age
    from mindshare_snapshots
    order by handle, taken_at desc`) as {
    handle: string;
    mindshare: number;
    vertical: string | null;
    age: string;
  }[];
  return rows.map((r) => ({
    handle: r.handle,
    mindshare: r.mindshare,
    vertical: r.vertical,
    ageSec: Number(r.age),
  }));
}
