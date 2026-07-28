/**
 * Verification NFT skins.
 *
 * A skin is purely presentational: it changes the artwork a verification NFT
 * resolves to, never its on-chain meaning. The `Verification` PDA (subject,
 * asset, handle, verified_at) is untouched — the badge attests the same thing
 * whichever skin is on it.
 *
 * Skins live here rather than in the database so the catalog is versioned with
 * the code and an unknown/removed id always degrades to `DEFAULT_SKIN` instead
 * of rendering a broken image.
 */

export interface Skin {
  id: string;
  name: string;
  /** Short line shown in the picker. */
  blurb: string;
  /** Card gradient — two hex stops, also used to render the OG/metadata image. */
  from: string;
  to: string;
  /** Accent used for the handle text and border. */
  accent: string;
}

export const SKINS: Skin[] = [
  {
    id: "signal",
    name: "Signal",
    blurb: "The default — protocol green on near-black.",
    from: "#0A0A0A",
    to: "#0f1620",
    accent: "#00E19B",
  },
  {
    id: "noise",
    name: "Noise",
    blurb: "Inverted alert red, for the contrarians.",
    from: "#140A0A",
    to: "#201014",
    accent: "#FF5C5C",
  },
  {
    id: "mono",
    name: "Monochrome",
    blurb: "No colour at all. Reads as understatement.",
    from: "#0A0A0A",
    to: "#1a1a1a",
    accent: "#F5F4F0",
  },
  {
    id: "solar",
    name: "Solar",
    blurb: "Amber gradient — warm against the dark UI.",
    from: "#1a1206",
    to: "#2a1c08",
    accent: "#FFB020",
  },
  {
    id: "tide",
    name: "Tide",
    blurb: "Deep blue, closest to a classic verified badge.",
    from: "#06121a",
    to: "#0a1e2e",
    accent: "#4DA6FF",
  },
];

/**
 * What a skin change costs, in lamports.
 *
 * Restyling is a protocol service, not a free toggle: it's paid to the treasury
 * like any other. Read from env so it can be tuned per-deployment without a
 * redeploy; the server treats this as the minimum it will accept.
 */
export const SKIN_FEE_LAMPORTS = Math.round(
  Number(process.env.NEXT_PUBLIC_SKIN_FEE_SOL ?? "0.01") * 1_000_000_000,
);

export const DEFAULT_SKIN_ID = "signal";

export const DEFAULT_SKIN: Skin = SKINS[0]!;

/** Resolve a stored id, falling back to the default for unknown/removed skins. */
export function skinById(id: string | null | undefined): Skin {
  if (!id) return DEFAULT_SKIN;
  return SKINS.find((s) => s.id === id) ?? DEFAULT_SKIN;
}

/** True when `id` names a skin in the current catalog. */
export function isValidSkinId(id: string): boolean {
  return SKINS.some((s) => s.id === id);
}

/**
 * The exact message a wallet signs to change its skin.
 *
 * Lives here rather than in the route module because Next only permits route
 * handlers and a fixed set of config exports from a `route.ts`; it also has to
 * be byte-identical on both sides, so a single definition is the point.
 */
export function skinMessage(subject: string, skin: string): string {
  return `Set my AttentionFi verification skin to "${skin}" for ${subject}.`;
}
