// Price-history store (Neon serverless). Snapshots of every bonding curve's
// spot price accumulate here so charts can show real history instead of a
// synthetic backfill. When no DATABASE_URL is configured the helpers no-op /
// return empty and callers fall back to synthetic candles.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function marketDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("market-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists price_snapshots (
        id bigint generated always as identity primary key,
        mint text not null,
        price_sol double precision not null,
        real_sol_lamports bigint not null,
        taken_at timestamptz not null default now()
      )`;
    await sql`
      create index if not exists price_snapshots_mint_time_idx
      on price_snapshots (mint, taken_at)`;
  })().catch((e) => {
    schemaReady = null; // allow retry on transient failure
    throw e;
  });
  return schemaReady;
}

export interface SnapshotInsert {
  mint: string;
  priceSol: number;
  realSolLamports: bigint;
}

export interface SnapshotRow {
  /** epoch seconds */
  time: number;
  priceSol: number;
  realSolLamports: bigint;
}

/** Age in seconds of the newest snapshot, or null when the table is empty. */
export async function newestSnapshotAge(): Promise<number | null> {
  await ensureSchema();
  const rows = (await sql`
    select extract(epoch from (now() - max(taken_at))) as age from price_snapshots
  `) as { age: string | null }[];
  const age = rows[0]?.age;
  return age === null || age === undefined ? null : Number(age);
}

export async function insertSnapshots(snapshots: SnapshotInsert[]): Promise<void> {
  if (snapshots.length === 0) return;
  await ensureSchema();
  for (const s of snapshots) {
    await sql`
      insert into price_snapshots (mint, price_sol, real_sol_lamports)
      values (${s.mint}, ${s.priceSol}, ${s.realSolLamports.toString()})`;
  }
}

export async function getSnapshots(
  mint: string,
  fromEpoch: number,
  toEpoch: number,
): Promise<SnapshotRow[]> {
  await ensureSchema();
  const rows = (await sql`
    select extract(epoch from taken_at) as time, price_sol, real_sol_lamports
    from price_snapshots
    where mint = ${mint}
      and taken_at >= to_timestamp(${fromEpoch})
      and taken_at <= to_timestamp(${toEpoch})
    order by taken_at asc
    limit 20000
  `) as { time: string; price_sol: number; real_sol_lamports: string }[];
  return rows.map((r) => ({
    time: Math.floor(Number(r.time)),
    priceSol: r.price_sol,
    realSolLamports: BigInt(r.real_sol_lamports),
  }));
}
