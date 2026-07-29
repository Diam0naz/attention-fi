import { PublicKey } from "@solana/web3.js";

/**
 * Maps an X handle to its on-chain token mint. Seeded from DEFAULTS +
 * NEXT_PUBLIC_TOKEN_REGISTRY, and extended at runtime as tokens are launched
 * from the UI (persisted to localStorage). Until an entry exists, the UI falls
 * back to mock data for that token.
 */
const DEFAULTS: Record<string, string> = {
  // Live demo token launched on devnet (Top100 tier). Opening /token/solana_kol
  // reads this curve on-chain and flips the terminal to LIVE.
  solana_kol: "FmYyWGtpvBEpyrY5JJhLkhWH1aiWdnVxzivJcBcfis4B",
};

/** Display metadata a launcher can attach — there's no on-chain metadata
 *  account for launched tokens (bare SPL mints), so this rides alongside the
 *  mint in the same per-browser record. */
export interface LaunchedTokenMeta {
  name?: string;
  symbol?: string;
  image?: string;
}

type RegistryEntry = string | ({ mint: string } & LaunchedTokenMeta);

const LS_KEY = "af.registry";

function staticRegistry(): Record<string, string> {
  try {
    const fromEnv = JSON.parse(process.env.NEXT_PUBLIC_TOKEN_REGISTRY ?? "{}") as Record<string, string>;
    return { ...DEFAULTS, ...fromEnv };
  } catch {
    return DEFAULTS;
  }
}

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
        tokens?: { handle: string; mint: string; name?: string; symbol?: string; image?: string }[];
      };
      const next: Record<string, RegistryEntry> = {};
      for (const t of body.tokens ?? []) {
        if (!t?.handle || !t?.mint) continue;
        next[norm(t.handle)] = {
          mint: t.mint,
          ...(t.name ? { name: t.name } : {}),
          ...(t.symbol ? { symbol: t.symbol } : {}),
          ...(t.image ? { image: t.image } : {}),
        };
      }
      remote = next;
    } catch {
      // Offline or no registry configured — the local view still works.
      remoteLoaded = null;
    }
  })();
  return remoteLoaded;
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
  if (!mint) return null;
  try {
    return new PublicKey(mint);
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
 * Every known handle — statics + env + the server registry + this browser's
 * own launches — for symbol listings, search and the watchlist.
 *
 * Synchronous by necessity (its callers are), so it reflects whatever
 * `syncRegistry()` has cached. Callers that care about freshness should await
 * that first.
 */
export function allTokenHandles(): string[] {
  return Object.keys({ ...staticRegistry(), ...remoteRegistry(), ...launchedRegistry() });
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
  current[norm(handle)] = meta ? { mint, ...meta } : mint;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(current));
  } catch {
    // Quota exceeded — most likely a large data: URI image. Persist the
    // essential mint→handle mapping without the image rather than losing the
    // launch record entirely.
    const { image: _image, ...rest } = (typeof current[norm(handle)] === "object"
      ? (current[norm(handle)] as { mint: string } & LaunchedTokenMeta)
      : { mint }) as { mint: string } & LaunchedTokenMeta;
    current[norm(handle)] = rest.name || rest.symbol ? rest : mint;
    window.localStorage.setItem(LS_KEY, JSON.stringify(current));
  }

  if (db) {
    // Fire-and-forget: a failed sync just means this launch stays local until
    // the next successful write; never block the launch confirmation on it.
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
  for (const handle of Object.keys(local)) {
    const entry = local[handle]!;
    byHandle.set(
      handle,
      typeof entry === "string"
        ? { handle, mint: entry }
        : { handle, mint: entry.mint, name: entry.name, symbol: entry.symbol, image: entry.image },
    );
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
