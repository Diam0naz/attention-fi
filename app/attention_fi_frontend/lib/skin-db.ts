// Verification NFT skin selections (Neon serverless).
//
// One row per verified wallet — the program allows a single Verification PDA
// per subject, so the subject address is a natural primary key.
//
// This is the only mutable half of a verification NFT's appearance: the asset's
// on-chain `uri` points at /api/verification/<subject>, which reads this table.
// Changing a skin is therefore a row update, not a transaction — no signature
// from the update authority, no rent, and no redeploy.
//
// When no DATABASE_URL is configured the helpers no-op / return null and every
// badge renders with DEFAULT_SKIN, which is the correct degraded state.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function skinDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("skin-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

/**
 * Retry a query through a cold start.
 *
 * Neon auto-suspends when idle, and the first request after that can fail
 * outright ("fetch failed") rather than just being slow. Since a skin change
 * is paid for before this runs, a suspended database must not be what makes it
 * fail.
 */
async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastError;
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists verification_skin (
        subject text primary key,
        skin text not null,
        updated_at timestamptz not null default now()
      )`;
    // Signature as primary key is the replay guard: the same paid transaction
    // can't be submitted twice to buy a second skin change.
    await sql`
      create table if not exists skin_payment (
        signature text primary key,
        subject text not null,
        paid_at timestamptz not null default now()
      )`;
  })().catch((e) => {
    schemaReady = null; // allow retry on transient failure
    throw e;
  });
  return schemaReady;
}

/** The chosen skin id for a subject, or null when unset / db unavailable. */
export async function getSkin(subject: string): Promise<string | null> {
  if (!skinDbConfigured()) return null;
  await ensureSchema();
  const rows = (await sql`
    select skin from verification_skin where subject = ${subject}`) as { skin: string }[];
  return rows[0]?.skin ?? null;
}

/** Skins for many subjects at once — one round trip for a grid of badges. */
export async function getSkins(subjects: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (subjects.length === 0 || !skinDbConfigured()) return out;
  await ensureSchema();
  const rows = (await sql`
    select subject, skin from verification_skin
    where subject = any(${subjects})`) as { subject: string; skin: string }[];
  for (const r of rows) out.set(r.subject, r.skin);
  return out;
}

/** Set a subject's skin. Callers must have verified wallet ownership first. */
export async function putSkin(subject: string, skin: string): Promise<void> {
  await ensureSchema();
  await sql`
    insert into verification_skin (subject, skin, updated_at)
    values (${subject}, ${skin}, now())
    on conflict (subject) do update set skin = ${skin}, updated_at = now()`;
}

/**
 * Consume a payment signature and apply the skin, atomically.
 *
 * Deliberately one statement rather than two: splitting it leaves a window
 * where the signature is spent but the skin never lands, which would take the
 * user's fee and give nothing back. The CTE means either both happen or
 * neither, so a failure is always safe to retry with the same signature.
 *
 * Returns false when the signature was already spent — one payment buys
 * exactly one change.
 */
export async function redeemSkinPayment(
  subject: string,
  skin: string,
  signature: string,
): Promise<boolean> {
  await withRetry(() => ensureSchema());
  const rows = (await withRetry(() => sql`
    with claim as (
      insert into skin_payment (signature, subject, paid_at)
      values (${signature}, ${subject}, now())
      on conflict (signature) do nothing
      returning signature
    )
    insert into verification_skin (subject, skin, updated_at)
    select ${subject}, ${skin}, now() from claim
    on conflict (subject) do update set skin = excluded.skin, updated_at = now()
    returning subject`)) as { subject: string }[];
  return rows.length > 0;
}
