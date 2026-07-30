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
 * outright ("fetch failed") rather than just being slow. Writes must not lose a
 * paid-for change to that; reads must not either, since a caller that falls
 * back to defaults renders a bought skin as unset.
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
    // can't be submitted twice to buy two different skins.
    await sql`
      create table if not exists skin_payment (
        signature text primary key,
        subject text not null,
        paid_at timestamptz not null default now()
      )`;
    // Skins are bought once and kept: this records what a wallet has unlocked,
    // separately from which one it's currently wearing. Switching back to an
    // owned skin is free, so ownership can't live in verification_skin — that
    // holds a single current value.
    await sql`
      create table if not exists skin_ownership (
        subject text not null,
        skin text not null,
        acquired_at timestamptz not null default now(),
        primary key (subject, skin)
      )`;
    // Record which skin a payment bought. Older rows predate the column and
    // stay null — the backfill below is what covers them.
    await sql`alter table skin_payment add column if not exists skin text`;

    // Backfill ownership for wallets that paid before skins were durable.
    //
    // skin_payment doesn't say which skin each payment bought, so the only
    // provable claim is the one each subject is currently wearing — they paid
    // for that. Anyone who bought several and switched away can't be
    // reconstructed from this schema; they'd re-buy an older one. Charging
    // again for the skin actually on their badge would be the visible wrong,
    // and this prevents it. Idempotent, so it's safe on every cold start.
    await sql`
      insert into skin_ownership (subject, skin, acquired_at)
      select subject, skin, updated_at from verification_skin
      on conflict (subject, skin) do nothing`;

    // The Signature skin carries artwork instead of a palette, so the choice
    // alone isn't enough to render it — the URL lives beside it. Null for every
    // other skin.
    await sql`alter table verification_skin add column if not exists custom_uri text`;

    // Skins for perk and genesis NFTs. Keyed by (class, asset) rather than by
    // wallet: those PDAs are keyed by asset and a wallet can hold several, so
    // one row per wallet — the shape verification_skin uses — can't address
    // them individually. Ownership stays wallet-scoped in skin_ownership: you
    // buy a skin once and may wear it on any NFT you hold.
    await sql`
      create table if not exists nft_skin (
        class text not null,
        asset text not null,
        skin text not null,
        updated_at timestamptz not null default now(),
        primary key (class, asset)
      )`;
    await sql`alter table nft_skin add column if not exists custom_uri text`;
  })().catch((e) => {
    schemaReady = null; // allow retry on transient failure
    throw e;
  });
  return schemaReady;
}

/** The chosen skin id for a subject, or null when unset / db unavailable. */
export async function getSkin(subject: string): Promise<string | null> {
  return (await getSkinWithUri(subject)).skin;
}

/** A skin selection together with its artwork, when the skin is Signature. */
export interface SkinSelection {
  skin: string | null;
  customUri: string | null;
}

export async function getSkinWithUri(subject: string): Promise<SkinSelection> {
  if (!skinDbConfigured()) return { skin: null, customUri: null };
  await withRetry(() => ensureSchema());
  const rows = (await withRetry(() => sql`
    select skin, custom_uri from verification_skin where subject = ${subject}`)) as {
    skin: string;
    custom_uri: string | null;
  }[];
  const row = rows[0];
  return { skin: row?.skin ?? null, customUri: row?.custom_uri ?? null };
}

/** Skins for many subjects at once — one round trip for a grid of badges. */
export async function getSkins(subjects: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (subjects.length === 0 || !skinDbConfigured()) return out;
  await withRetry(() => ensureSchema());
  const rows = (await withRetry(() => sql`
    select subject, skin from verification_skin
    where subject = any(${subjects})`)) as { subject: string; skin: string }[];
  for (const r of rows) out.set(r.subject, r.skin);
  return out;
}

/** Set a subject's skin. Callers must have verified wallet ownership first. */
export async function putSkin(subject: string, skin: string): Promise<void> {
  await withRetry(() => ensureSchema());
  await withRetry(() => sql`
    insert into verification_skin (subject, skin, updated_at)
    values (${subject}, ${skin}, now())
    on conflict (subject) do update set skin = ${skin}, updated_at = now()`);
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
      insert into skin_payment (signature, subject, skin, paid_at)
      values (${signature}, ${subject}, ${skin}, now())
      on conflict (signature) do nothing
      returning signature
    ),
    -- Unlocking is the durable half of the purchase: the wearer can switch
    -- away and back for free afterwards, so this must land in the same
    -- statement as the payment claim.
    own as (
      insert into skin_ownership (subject, skin, acquired_at)
      select ${subject}, ${skin}, now() from claim
      on conflict (subject, skin) do nothing
    )
    insert into verification_skin (subject, skin, updated_at)
    select ${subject}, ${skin}, now() from claim
    on conflict (subject) do update set skin = excluded.skin, updated_at = now()
    returning subject`)) as { subject: string }[];
  return rows.length > 0;
}

/** Every skin this wallet has unlocked. */
export async function getOwnedSkins(subject: string): Promise<string[]> {
  if (!skinDbConfigured()) return [];
  await withRetry(() => ensureSchema());
  const rows = (await withRetry(() => sql`
    select skin from skin_ownership where subject = ${subject}`)) as { skin: string }[];
  return rows.map((r) => r.skin);
}

/**
 * Wear a skin the wallet already owns, at no charge.
 *
 * Ownership is re-checked in the same statement that applies the change rather
 * than in a prior query, so a skin can't be applied on the strength of a
 * check that was true a moment earlier. Returns false when unowned.
 */
export async function applyOwnedSkin(
  subject: string,
  skin: string,
  customUri: string | null = null,
): Promise<boolean> {
  await withRetry(() => ensureSchema());
  // custom_uri is written on every switch, not just Signature ones: leaving a
  // stale URL behind would resurrect old artwork the next time Signature is
  // selected, without the holder choosing it.
  const rows = (await withRetry(() => sql`
    insert into verification_skin (subject, skin, custom_uri, updated_at)
    select ${subject}, ${skin}, ${customUri}, now()
    where exists (
      select 1 from skin_ownership where subject = ${subject} and skin = ${skin}
    )
    on conflict (subject) do update
      set skin = excluded.skin, custom_uri = excluded.custom_uri, updated_at = now()
    returning subject`)) as { subject: string }[];
  return rows.length > 0;
}

/**
 * Consume a payment signature and unlock a skin, without wearing it anywhere.
 *
 * Unlocking is wallet-level: it is not tied to a verification badge, and the
 * holder chooses afterwards which NFT wears it. Same atomicity argument as
 * redeemSkinPayment — claiming the signature and granting the skin must land
 * together, or a paid-for unlock could be lost.
 *
 * Returns false when the signature was already spent.
 */
export async function redeemSkinUnlock(
  subject: string,
  skin: string,
  signature: string,
): Promise<boolean> {
  await withRetry(() => ensureSchema());
  const rows = (await withRetry(() => sql`
    with claim as (
      insert into skin_payment (signature, subject, skin, paid_at)
      values (${signature}, ${subject}, ${skin}, now())
      on conflict (signature) do nothing
      returning signature
    )
    insert into skin_ownership (subject, skin, acquired_at)
    select ${subject}, ${skin}, now() from claim
    on conflict (subject, skin) do nothing
    returning subject`)) as { subject: string }[];
  return rows.length > 0;
}

/**
 * Grant a skin without payment.
 *
 * Used for the default skin, which everyone wears before they buy anything and
 * must always be free to return to.
 */
export async function grantSkin(subject: string, skin: string): Promise<void> {
  await withRetry(() => ensureSchema());
  await withRetry(() => sql`
    insert into skin_ownership (subject, skin, acquired_at)
    values (${subject}, ${skin}, now())
    on conflict (subject, skin) do nothing`);
}


/* ── per-asset skins (perk / genesis) ─────────────────────────────────── */

/** NFT classes that carry an individually-skinnable asset. */
export type SkinClass = "perk" | "genesis";

/** The skin worn by one asset, or null when unset / db unavailable. */
export async function getAssetSkin(cls: SkinClass, asset: string): Promise<string | null> {
  return (await getAssetSkinWithUri(cls, asset)).skin;
}

export async function getAssetSkinWithUri(
  cls: SkinClass,
  asset: string,
): Promise<SkinSelection> {
  if (!skinDbConfigured()) return { skin: null, customUri: null };
  await withRetry(() => ensureSchema());
  const rows = (await withRetry(() => sql`
    select skin, custom_uri from nft_skin
    where class = ${cls} and asset = ${asset}`)) as {
    skin: string;
    custom_uri: string | null;
  }[];
  const row = rows[0];
  return { skin: row?.skin ?? null, customUri: row?.custom_uri ?? null };
}

/**
 * Wear `skin` on one asset, provided `owner` has unlocked that skin.
 *
 * Ownership is checked inside the same statement that applies the change, so a
 * skin can't be applied on the strength of a check that was true a moment
 * earlier. The caller must separately have proven it controls `owner` and that
 * `owner` holds `asset` — this only enforces the skin entitlement.
 */
export async function applyAssetSkin(
  cls: SkinClass,
  asset: string,
  skin: string,
  owner: string,
  customUri: string | null = null,
): Promise<boolean> {
  await withRetry(() => ensureSchema());
  // Written unconditionally so switching away from Signature clears the
  // artwork rather than leaving it to reappear on the next selection.
  const rows = (await withRetry(() => sql`
    insert into nft_skin (class, asset, skin, custom_uri, updated_at)
    select ${cls}, ${asset}, ${skin}, ${customUri}, now()
    where exists (
      select 1 from skin_ownership where subject = ${owner} and skin = ${skin}
    )
    on conflict (class, asset) do update
      set skin = excluded.skin, custom_uri = excluded.custom_uri, updated_at = now()
    returning asset`)) as { asset: string }[];
  return rows.length > 0;
}
