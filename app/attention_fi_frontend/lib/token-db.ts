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
        handle text not null,
        mint text not null,
        creator text not null,
        name text,
        symbol text,
        image text,
        mechanism text,
        created_at timestamptz not null default now()
      )`;
    // Migration for tables created when `handle` was the primary key.
    //
    // That key silently lost tokens. A handle can legitimately carry many
    // launches — the rate limit allows three a day, and two different people
    // may both launch about the same subject — but only one row could exist
    // per handle, so a second launch either overwrote the first or, under a
    // different creator, hit the upsert's creator guard and wrote nothing at
    // all while still reporting success. The mint is what is actually unique
    // per token, so it is what the row is keyed by.
    //
    // Each statement is individually idempotent, and a unique index rather
    // than a PK constraint is what makes that true: `add constraint` errors
    // when it already exists, `create unique index if not exists` does not,
    // and ON CONFLICT works against either.
    // Dropping the old key is best-effort. A deployment whose database role
    // can't ALTER should still be able to read the registry — failing here
    // would take every launch page down to fix a write path.
    try {
      await sql`alter table launched_tokens drop constraint if exists launched_tokens_pkey`;
    } catch (e) {
      console.error("[token-db] could not drop the legacy handle key:", e);
    }
    // This one is not optional: `on conflict (mint)` needs it to exist.
    await sql`
      create unique index if not exists launched_tokens_mint_key
      on launched_tokens (mint)`;
    await sql`
      create index if not exists launched_tokens_handle_idx
      on launched_tokens (handle)`;
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
 * Record a launch, keyed by mint.
 *
 * One row per token rather than per handle, so a handle can carry as many
 * launches as it has. Re-registering the same mint updates its display fields;
 * the creator guard still stands, but it now protects the right thing — a mint
 * has exactly one creator, fixed on-chain at launch, so the guard can only ever
 * reject an impostor. Under the old handle key it also rejected the legitimate
 * second launcher of a subject, silently.
 */
export async function registerToken(input: RegisterTokenInput): Promise<void> {
  await ensureSchema();
  await sql`
    insert into launched_tokens (handle, mint, creator, name, symbol, image, mechanism)
    values (
      ${input.handle}, ${input.mint}, ${input.creator},
      ${input.name ?? null}, ${input.symbol ?? null}, ${input.image ?? null}, ${input.mechanism ?? null}
    )
    on conflict (mint) do update set
      handle = excluded.handle,
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

/**
 * The current token for a handle — the most recent launch, or null.
 *
 * Newest rather than arbitrary: a handle may now have several tokens, and
 * `limit 1` without an order returns whichever row the planner reaches first,
 * which can change between calls for no visible reason. Use `tokensByHandle`
 * where every launch for a subject matters.
 */
export async function tokenByHandle(handle: string): Promise<LaunchedToken | null> {
  await ensureSchema();
  const rows = (await sql`
    select handle, mint, creator, name, symbol, image, mechanism
    from launched_tokens where handle = ${handle}
    order by created_at desc limit 1`) as Record<string, unknown>[];
  return rows[0] ? toToken(rows[0]) : null;
}

/** Every token launched for a handle, newest first. */
export async function tokensByHandle(handle: string): Promise<LaunchedToken[]> {
  await ensureSchema();
  const rows = (await sql`
    select handle, mint, creator, name, symbol, image, mechanism
    from launched_tokens where handle = ${handle}
    order by created_at desc limit 100`) as Record<string, unknown>[];
  return rows.map(toToken);
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
