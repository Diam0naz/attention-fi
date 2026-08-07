/**
 * Handle→mint mappings that exist in configuration rather than in the database.
 *
 * Isolated from ./registry so the server can read them too. Those seeds used to
 * live only inside the client registry, which meant a token configured here was
 * fully known in the browser and completely unknown to anything rendered
 * server-side — so a genesis NFT for it named its subject in the app and fell
 * back to a raw mint in the wallet showing the very same NFT.
 *
 * Deliberately free of `window`, database and Solana imports so both sides can
 * take it without dragging anything else along.
 */

const DEFAULTS: Record<string, string> = {
  // Live demo token launched on devnet (Top100 tier). Opening /token/solana_kol
  // reads this curve on-chain and flips the terminal to LIVE.
  solana_kol: "FmYyWGtpvBEpyrY5JJhLkhWH1aiWdnVxzivJcBcfis4B",
};

export const normHandle = (handle: string) => handle.replace(/^@/, "").toLowerCase();

/** DEFAULTS merged with NEXT_PUBLIC_TOKEN_REGISTRY, which overrides. */
export function staticRegistry(): Record<string, string> {
  try {
    const fromEnv = JSON.parse(process.env.NEXT_PUBLIC_TOKEN_REGISTRY ?? "{}") as Record<
      string,
      string
    >;
    return { ...DEFAULTS, ...fromEnv };
  } catch {
    return DEFAULTS;
  }
}

/**
 * The handle configured for a mint, if any.
 *
 * Only a handle: these entries carry no name or symbol, because a mapping in
 * configuration is an address book, not metadata. Callers should treat a hit
 * as "we know what this is called" and nothing more.
 */
export function staticHandleForMint(mint: string): string | null {
  for (const [handle, addr] of Object.entries(staticRegistry())) {
    if (addr === mint) return handle;
  }
  return null;
}
