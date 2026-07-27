// Farcaster identity cache (Neon serverless).
//
// Resolving a handle to an FID is an on-protocol lookup that effectively never
// changes once it succeeds, so it's cached permanently rather than re-queried
// every mindshare sweep. Negative results are cached too — but with a TTL,
// since a handle with no Farcaster account today may register one later.
//
// When no DATABASE_URL is configured the helpers no-op / return empty and the
// resolver falls back to its in-process cache for the life of the instance.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function farcasterDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("farcaster-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists farcaster_identity (
        handle text primary key,
        fid bigint,
        checked_at timestamptz not null default now()
      )`;
  })().catch((e) => {
    schemaReady = null; // allow retry on transient failure
    throw e;
  });
  return schemaReady;
}

export interface CachedIdentity {
  handle: string;
  /** null means "checked, and no Farcaster account has this name". */
  fid: number | null;
  /** Seconds since this handle was last resolved. */
  ageSec: number;
}

/** Every cached identity, keyed by handle — one round trip per sweep. */
export async function getIdentities(handles: string[]): Promise<Map<string, CachedIdentity>> {
  const out = new Map<string, CachedIdentity>();
  if (handles.length === 0) return out;
  await ensureSchema();
  const rows = (await sql`
    select handle, fid, extract(epoch from (now() - checked_at)) as age
    from farcaster_identity
    where handle = any(${handles})`) as {
    handle: string;
    fid: string | null;
    age: string;
  }[];
  for (const r of rows) {
    out.set(r.handle, {
      handle: r.handle,
      fid: r.fid === null ? null : Number(r.fid),
      ageSec: Number(r.age),
    });
  }
  return out;
}

/** Record a resolution result (fid, or null for "no such account"). */
export async function putIdentity(handle: string, fid: number | null): Promise<void> {
  await ensureSchema();
  await sql`
    insert into farcaster_identity (handle, fid, checked_at)
    values (${handle}, ${fid}, now())
    on conflict (handle) do update set fid = ${fid}, checked_at = now()`;
}
