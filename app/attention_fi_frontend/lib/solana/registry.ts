import { PublicKey } from "@solana/web3.js";
import { staticRegistry } from "./static-registry";
import { mechanismInScope } from "@/lib/scope";

/**
 * Maps an X handle to its on-chain token mint. Seeded from the shared static
 * registry (DEFAULTS + NEXT_PUBLIC_TOKEN_REGISTRY), and extended at runtime as
 * tokens are launched from the UI (persisted to localStorage). Until an entry
 * exists, the UI falls back to mock data for that token.
 *
 * The static seeds live in ./static-registry so server-rendered surfaces can
 * read them too — see the note there.
 */

/** Display metadata a launcher can attach — there's no on-chain metadata
 *  account for launched tokens (bare SPL mints), so this rides alongside the
 *  mint in the same per-browser record. */
export interface LaunchedTokenMeta {
  name?: string;
  symbol?: string;
  image?: string;
  /**
   * Who launched it, and under which mechanism — kept so a registration that
   * failed to reach the server can be replayed later from this record alone.
   * Absent on entries written before that mattered.
   */
  creator?: string;
  mechanism?: string;
}

type RegistryEntry = string | ({ mint: string } & LaunchedTokenMeta);

const LS_KEY = "af.registry";


/**
 * Tokens the server knows about, from /api/tokens.
 *
 * localStorage only ever holds launches made from *this* browser, so without
 * this a token launched on another device — or by anyone else — was invisible
 * to search, the watchlist and handleToMint, and so untradeable here. Held in
 * a module-level cache because the sync readers below can't await.
 */
let remote: Record<string, RegistryEntry> = {};
let remoteLoaded: Promise<void> | null = null;

function remoteRegistry(): Record<string, RegistryEntry> {
  return remote;
}

/**
 * Pull the server registry into the cache. Safe to call repeatedly; the fetch
 * happens once unless `force` is set (e.g. right after launching a token).
 */
export function syncRegistry(force = false): Promise<void> {
  if (force) remoteLoaded = null;
  remoteLoaded ??= (async () => {
    try {
      const res = await fetch("/api/tokens");
      if (!res.ok) return;
      const body = (await res.json()) as {
        tokens?: {
          handle: string;
          mint: string;
          name?: string;
          symbol?: string;
          image?: string;
          mechanism?: string | null;
        }[];
      };
      const next: Record<string, RegistryEntry> = {};
      for (const t of body.tokens ?? []) {
        if (!t?.handle || !t?.mint) continue;
        // Tokens launched under a mechanism outside the current scope
        // (lib/scope.ts) aren't listed. Skipping them here also lets an older
        // in-scope launch under the same handle be the one a search finds.
        if (t.mechanism && !mechanismInScope(t.mechanism)) continue;
        const key = norm(t.handle);
        // A handle can carry several launches, and this map holds one. The
        // server returns them newest-first, so the first sighting wins and the
        // rest are skipped — assigning unconditionally would have let the
        // OLDEST token win, which is the opposite of what a reader expects
        // when they search a handle and get "its" token.
        if (key in next) continue;
        next[key] = {
          mint: t.mint,
          ...(t.name ? { name: t.name } : {}),
          ...(t.symbol ? { symbol: t.symbol } : {}),
          ...(t.image ? { image: t.image } : {}),
        };
      }
      remote = next;
      void replayUnsynced();
    } catch {
      // Offline or no registry configured — the local view still works.
      remoteLoaded = null;
    }
  })();
  return remoteLoaded;
}

/**
 * Re-POST launches this browser recorded but the server doesn't have.
 *
 * The write in `registerToken` is fire-and-forget so a slow registry never
 * blocks a launch confirmation — but nothing retried it, so a single failed
 * request stranded a token permanently: live on-chain, absent from search, the
 * watchlist and `mintToToken`. That last one is why a genesis NFT ends up
 * saying "0.3% of Fee-share" instead of naming the token paying it — the NFT
 * stores only `subject_mint`, and the name it needs exists nowhere else.
 *
 * The launcher's own browser is the only place that still holds the name and
 * symbol, since launched tokens are bare SPL mints with no on-chain metadata
 * account. So the recovery has to happen here, from this record, rather than by
 * reconciling against the chain — the chain knows the mint but never knew the
 * name.
 *
 * Best-effort and idempotent: `/api/tokens` upserts on mint, so replaying an
 * entry the server already has is a no-op. It used to upsert on handle, which
 * made replay actively harmful — a second launch under the same handle
 * overwrote the first rather than joining it.
 */
async function replayUnsynced(): Promise<void> {
  const local = launchedRegistry();
  const knownMints = new Set(Object.values(remote).map(mintOf));

  for (const [handle, entry] of Object.entries(local)) {
    if (typeof entry === "string") continue; // no metadata worth replaying
    if (knownMints.has(entry.mint)) continue;
    // Without a creator this predates the field; the server requires one, and
    // guessing the connected wallet would attribute someone else's launch.
    if (!entry.creator) continue;
    try {
      await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: norm(handle),
          mint: entry.mint,
          creator: entry.creator,
          name: entry.name ?? null,
          symbol: entry.symbol ?? null,
          image: entry.image ?? null,
          mechanism: entry.mechanism ?? null,
        }),
      });
    } catch {
      // Still unreachable — the entry stays local and the next sync tries again.
    }
  }
}

function launchedRegistry(): Record<string, RegistryEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}") as Record<string, RegistryEntry>;
  } catch {
    return {};
  }
}

const norm = (handle: string) => handle.replace(/^@/, "").toLowerCase();

function mintOf(entry: RegistryEntry): string {
  return typeof entry === "string" ? entry : entry.mint;
}

export function handleToMint(handle: string): PublicKey | null {
  const key = norm(handle);
  // This browser's own launches win, then the server registry, then statics.
  const entry = launchedRegistry()[key] ?? remoteRegistry()[key];
  const mint = (entry && mintOf(entry)) ?? staticRegistry()[key];
  if (!mint) {
    // Nothing in the registry — but the argument may already *be* a mint.
    //
    // Every trading surface routes by handle, so a token missing from the
    // registry became untradeable in the app even while the wallet plainly
    // held it and the profile priced it correctly. The registry is a naming
    // convenience; the mint is the thing that actually identifies a token, and
    // refusing to accept one made a lookup failure look like a broken market.
    return asMint(handle);
  }
  try {
    return new PublicKey(mint);
  } catch {
    return null;
  }
}

/** Parse a string as a mint address, or null if it isn't one. */
function asMint(value: string): PublicKey | null {
  // Base58 pubkeys are 32–44 chars; anything shorter is a handle and would
  // only make PublicKey throw.
  if (value.length < 32 || value.length > 44) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

/** Name/symbol/image a launcher attached at launch time, if any (this browser only). */
export function launchedMeta(handle: string): LaunchedTokenMeta | null {
  const key = norm(handle);
  const entry = launchedRegistry()[key] ?? remoteRegistry()[key];
  if (!entry || typeof entry === "string") return null;
  const { name, symbol, image } = entry;
  return { name, symbol, image };
}

/**
 * The token a mint belongs to — the reverse of {@link handleToMint}.
 *
 * Genesis NFTs are a claim on a *specific* token's fee stream and store only
 * `subject_mint` on-chain, so a card that can't turn that back into a handle
 * can only say "0.3% of something". Same precedence as handleToMint: this
 * browser's launches, then the server registry, then statics.
 *
 * Synchronous like its neighbours, so it reflects whatever `syncRegistry()`
 * has already cached.
 */
export function mintToToken(
  mint: string,
): { handle: string; name?: string; symbol?: string } | null {
  const sources = [launchedRegistry(), remoteRegistry()];
  for (const source of sources) {
    for (const [handle, entry] of Object.entries(source)) {
      if (mintOf(entry) !== mint) continue;
      if (typeof entry === "string") return { handle };
      const { name, symbol } = entry;
      return { handle, ...(name ? { name } : {}), ...(symbol ? { symbol } : {}) };
    }
  }
  for (const [handle, addr] of Object.entries(staticRegistry())) {
    if (addr === mint) return { handle };
  }
  return null;
}

/**
 * Every known handle — statics + env + the server registry + this browser's
 * own launches — for symbol listings, search and the watchlist.
 *
 * Synchronous by necessity (its callers are), so it reflects whatever
 * `syncRegistry()` has cached. Callers that care about freshness should await
 * that first.
 */
export function allTokenHandles(): string[] {
  // This browser's own launches carry their mechanism; out-of-scope ones stay
  // out of listings, as they do in the server registry (see syncRegistry).
  const local = Object.fromEntries(
    Object.entries(launchedRegistry()).filter(
      ([, e]) => typeof e === "string" || !e.mechanism || mechanismInScope(e.mechanism),
    ),
  );
  return Object.keys({ ...staticRegistry(), ...remoteRegistry(), ...local });
}

/** Handles launched from this browser (i.e. tokens the user created). */
export function launchedHandles(): string[] {
  return Object.keys(launchedRegistry());
}

/** Record a freshly-launched token. Writes the browser-local cache immediately
 *  (synchronous readers stay fast) and, when `db` is supplied, mirrors it to
 *  the Neon-backed registry so the creator's launches survive across ports and
 *  devices (localStorage is per-origin). */
export function registerToken(
  handle: string,
  mint: string,
  meta?: LaunchedTokenMeta,
  db?: { creator: string; mechanism?: string },
): void {
  if (typeof window === "undefined") return;
  const current = launchedRegistry();
  // The creator and mechanism ride along so a failed server write can be
  // replayed later — see replayUnsynced. Without them the local record is a
  // dead end and the launch never reaches the registry.
  const record = {
    mint,
    ...meta,
    ...(db ? { creator: db.creator, ...(db.mechanism ? { mechanism: db.mechanism } : {}) } : {}),
  };
  current[norm(handle)] = meta || db ? record : mint;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(current));
  } catch {
    // Quota exceeded — most likely a large data: URI image. Persist the
    // essential mint→handle mapping without the image rather than losing the
    // launch record entirely.
    const { image: _image, ...rest } = (typeof current[norm(handle)] === "object"
      ? (current[norm(handle)] as { mint: string } & LaunchedTokenMeta)
      : { mint }) as { mint: string } & LaunchedTokenMeta;
    // Collapsing to a bare mint string would throw away the creator, and with
    // it the ability to replay this registration — so keep the object whenever
    // it still carries anything the server needs.
    current[norm(handle)] = rest.name || rest.symbol || rest.creator ? rest : mint;
    window.localStorage.setItem(LS_KEY, JSON.stringify(current));
  }

  if (db) {
    // Fire-and-forget so a slow registry never delays the launch confirmation.
    // A failure isn't final: the record above carries the creator, and the next
    // syncRegistry replays anything the server turns out not to have.
    void fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: norm(handle),
        mint,
        creator: db.creator,
        name: meta?.name ?? null,
        symbol: meta?.symbol ?? null,
        image: meta?.image ?? null,
        mechanism: db.mechanism ?? null,
      }),
    }).catch(() => undefined);
  }
}

/** A creator's launch, from the durable registry merged with local cache. */
export interface CreatedToken {
  handle: string;
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
}

interface DbToken {
  handle: string;
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
}

/** The wallet's launches from the durable DB ([] when unconfigured/unreachable). */
async function fetchCreatedFromDb(creator: string): Promise<DbToken[]> {
  try {
    const res = await fetch(`/api/tokens?creator=${encodeURIComponent(creator)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { tokens?: DbToken[] };
    return json.tokens ?? [];
  } catch {
    return [];
  }
}

/**
 * A wallet's created tokens: the durable DB record (cross-device) merged with
 * this browser's local launches (which cover a token that was just launched
 * before its DB write lands, or when the DB isn't configured). DB wins on
 * conflict since it's authoritative and creator-scoped.
 */
export async function myCreatedTokens(creator: string): Promise<CreatedToken[]> {
  const byHandle = new Map<string, CreatedToken>();
  const local = launchedRegistry();
  // Local entries are this *browser's* launches, not this *wallet's*. Adding
  // them unfiltered meant "Tokens you created" showed the same list no matter
  // which wallet was connected — it couldn't change, because nothing in it
  // depended on the wallet. Only entries that name this creator qualify.
  //
  // Entries written before the creator was recorded can't be attributed, so
  // they're left to the database lookup below, which is creator-scoped and
  // authoritative. That can hide a legacy launch that never synced; showing
  // someone else's launch as yours is the worse of the two errors.
  for (const handle of Object.keys(local)) {
    const entry = local[handle]!;
    if (typeof entry === "string" || entry.creator !== creator) continue;
    byHandle.set(handle, {
      handle,
      mint: entry.mint,
      name: entry.name,
      symbol: entry.symbol,
      image: entry.image,
    });
  }
  for (const t of await fetchCreatedFromDb(creator)) {
    byHandle.set(t.handle, {
      handle: t.handle,
      mint: t.mint,
      name: t.name ?? undefined,
      symbol: t.symbol ?? undefined,
      image: t.image ?? undefined,
    });
    // hydrate the local cache so synchronous readers resolve it cross-device
    if (!local[t.handle]) local[t.handle] = { mint: t.mint, name: t.name ?? undefined };
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(local));
    } catch {
      /* quota — the in-memory merge above is still returned */
    }
  }
  return [...byHandle.values()];
}

/** Resolve a handle→{mint, meta} from the durable DB when it isn't in the local
 *  cache (e.g. a visitor opening a token page for a token someone else launched
 *  on another device). */
export async function resolveTokenFromDb(
  handle: string,
): Promise<{ mint: PublicKey; meta: LaunchedTokenMeta } | null> {
  try {
    const res = await fetch(`/api/tokens?handle=${encodeURIComponent(norm(handle))}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { token?: DbToken | null };
    const t = json.token;
    if (!t?.mint) return null;
    return {
      mint: new PublicKey(t.mint),
      meta: { name: t.name ?? undefined, symbol: t.symbol ?? undefined, image: t.image ?? undefined },
    };
  } catch {
    return null;
  }
}
