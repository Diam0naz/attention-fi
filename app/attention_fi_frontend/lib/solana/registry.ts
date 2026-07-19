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

const LS_KEY = "af.registry";

function staticRegistry(): Record<string, string> {
  try {
    const fromEnv = JSON.parse(process.env.NEXT_PUBLIC_TOKEN_REGISTRY ?? "{}") as Record<string, string>;
    return { ...DEFAULTS, ...fromEnv };
  } catch {
    return DEFAULTS;
  }
}

function launchedRegistry(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

const norm = (handle: string) => handle.replace(/^@/, "").toLowerCase();

export function handleToMint(handle: string): PublicKey | null {
  const key = norm(handle);
  const mint = launchedRegistry()[key] ?? staticRegistry()[key];
  if (!mint) return null;
  try {
    return new PublicKey(mint);
  } catch {
    return null;
  }
}

/** Every known handle (static + env + runtime-launched), for symbol listings. */
export function allTokenHandles(): string[] {
  return Object.keys({ ...staticRegistry(), ...launchedRegistry() });
}

/** Record a freshly-launched token so the rest of the app can read it on-chain. */
export function registerToken(handle: string, mint: string): void {
  if (typeof window === "undefined") return;
  const current = launchedRegistry();
  current[norm(handle)] = mint;
  window.localStorage.setItem(LS_KEY, JSON.stringify(current));
}
