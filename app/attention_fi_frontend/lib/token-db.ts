// Launched-token registry (Neon serverless). A bare SPL mint carries no handle
// on-chain, so the handle↔mint mapping (and a creator's list of launches) has
// to live off-chain. localStorage alone is per-browser/per-origin, so a creator
// loses their tokens across ports/devices — this table is the durable, shared
// source of truth. When no DATABASE_URL is configured the helpers no-op and
// callers fall back to the localStorage registry.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function tokenDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("token-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists launched_tokens (
        handle text primary key,
        mint text not null,
        creator text not null,
        name text,
        symbol text,
        image text,
        mechanism text,
        created_at timestamptz not null default now()
      )`;
    await sql`
      create index if not exists launched_tokens_creator_idx
      on launched_tokens (creator)`;
  })().catch((e) => {
    schemaReady = null; // allow retry on transient failure
    throw e;
  });
  return schemaReady;
}

export interface LaunchedToken {
  handle: string;
  mint: string;
  creator: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  mechanism: string | null;
}

export interface RegisterTokenInput {
  handle: string;
  mint: string;
  creator: string;
  name?: string | null;
  symbol?: string | null;
  image?: string | null;
  mechanism?: string | null;
}

/**
 * Record a launch. The handle is the unique slot: the first creator to launch
 * it keeps it, and only that same creator may later update its metadata — a
 * different wallet can't overwrite (poison) an existing handle→mint mapping.
 */
export async function registerToken(input: RegisterTokenInput): Promise<void> {
  await ensureSchema();
  await sql`
    insert into launched_tokens (handle, mint, creator, name, symbol, image, mechanism)
    values (
      ${input.handle}, ${input.mint}, ${input.creator},
      ${input.name ?? null}, ${input.symbol ?? null}, ${input.image ?? null}, ${input.mechanism ?? null}
    )
    on conflict (handle) do update set
      mint = excluded.mint,
      name = excluded.name,
      symbol = excluded.symbol,
      image = excluded.image,
      mechanism = excluded.mechanism
    where launched_tokens.creator = excluded.creator`;
}

function toToken(r: Record<string, unknown>): LaunchedToken {
  return {
    handle: r.handle as string,
    mint: r.mint as string,
    creator: r.creator as string,
    name: (r.name as string | null) ?? null,
    symbol: (r.symbol as string | null) ?? null,
    image: (r.image as string | null) ?? null,
    mechanism: (r.mechanism as string | null) ?? null,
  };
}

/** Every token a wallet launched, newest first. */
export async function tokensByCreator(creator: string): Promise<LaunchedToken[]> {
  await ensureSchema();
  const rows = (await sql`
    select handle, mint, creator, name, symbol, image, mechanism
    from launched_tokens where creator = ${creator}
    order by created_at desc
    limit 500`) as Record<string, unknown>[];
  return rows.map(toToken);
}

/** Resolve a single handle→token, or null when unknown. */
export async function tokenByHandle(handle: string): Promise<LaunchedToken | null> {
  await ensureSchema();
  const rows = (await sql`
    select handle, mint, creator, name, symbol, image, mechanism
    from launched_tokens where handle = ${handle} limit 1`) as Record<string, unknown>[];
  return rows[0] ? toToken(rows[0]) : null;
}

/**
 * Resolve a mint back to its token, or null when unknown.
 *
 * The reverse of tokenByHandle. Genesis NFTs store only `subject_mint`
 * on-chain, so rendering "0.3% of $SQN" on the asset's artwork — the version a
 * wallet shows, where no client-side registry exists — needs this lookup.
 */
export async function tokenByMint(mint: string): Promise<LaunchedToken | null> {
  await ensureSchema();
  const rows = (await sql`
    select handle, mint, creator, name, symbol, image, mechanism
    from launched_tokens where mint = ${mint} limit 1`) as Record<string, unknown>[];
  return rows[0] ? toToken(rows[0]) : null;
}

/** All launched tokens (for the global feed/index). Capped. */
export async function allTokens(): Promise<LaunchedToken[]> {
  await ensureSchema();
  const rows = (await sql`
    select handle, mint, creator, name, symbol, image, mechanism
    from launched_tokens order by created_at desc limit 2000`) as Record<string, unknown>[];
  return rows.map(toToken);
}
