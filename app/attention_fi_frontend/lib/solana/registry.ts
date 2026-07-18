import { PublicKey } from "@solana/web3.js";

/**
 * Maps an X handle to its on-chain token mint. Empty until tokens are launched
 * on devnet — populate via NEXT_PUBLIC_TOKEN_REGISTRY (a JSON object of
 * { "handle": "<mint base58>" }) or by extending DEFAULTS below. Until an entry
 * exists, the UI falls back to mock data for that token.
 */
const DEFAULTS: Record<string, string> = {};

function loadRegistry(): Record<string, string> {
  try {
    const fromEnv = JSON.parse(process.env.NEXT_PUBLIC_TOKEN_REGISTRY ?? "{}") as Record<string, string>;
    return { ...DEFAULTS, ...fromEnv };
  } catch {
    return DEFAULTS;
  }
}

const REGISTRY = loadRegistry();

export function handleToMint(handle: string): PublicKey | null {
  const key = handle.replace(/^@/, "").toLowerCase();
  const mint = REGISTRY[key];
  if (!mint) return null;
  try {
    return new PublicKey(mint);
  } catch {
    return null;
  }
}
