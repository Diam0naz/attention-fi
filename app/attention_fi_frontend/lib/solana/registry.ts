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
  const entry = launchedRegistry()[key];
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
  const entry = launchedRegistry()[norm(handle)];
  if (!entry || typeof entry === "string") return null;
  const { name, symbol, image } = entry;
  return { name, symbol, image };
}

/** Every known handle (static + env + runtime-launched), for symbol listings. */
export function allTokenHandles(): string[] {
  return Object.keys({ ...staticRegistry(), ...launchedRegistry() });
}

/** Handles launched from this browser (i.e. tokens the user created). */
export function launchedHandles(): string[] {
  return Object.keys(launchedRegistry());
}

/** Record a freshly-launched token so the rest of the app can read it on-chain,
 *  plus whatever display metadata the creator gave it — there's no on-chain
 *  metadata account for bare SPL mints, so this is the only place it lives. */
export function registerToken(handle: string, mint: string, meta?: LaunchedTokenMeta): void {
  if (typeof window === "undefined") return;
  const current = launchedRegistry();
  current[norm(handle)] = meta ? { mint, ...meta } : mint;
  window.localStorage.setItem(LS_KEY, JSON.stringify(current));
}
