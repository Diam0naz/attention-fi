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

/**
 * True when `id` names a skin we recognise.
 *
 * Includes the custom skin, which is a valid selection but carries no palette
 * and so deliberately isn't in `SKINS`.
 */
export function isValidSkinId(id: string): boolean {
  return id === CUSTOM_SKIN_ID || SKINS.some((s) => s.id === id);
}

/**
 * How long a signed skin message stays valid.
 *
 * Re-applying an owned skin is authorised by a signature rather than a payment,
 * so the message carries a timestamp and the server refuses stale ones. The
 * action is idempotent and only ever affects the signer's own badge, so this is
 * hygiene rather than a security boundary — the window is generous enough to
 * survive a slow wallet prompt.
 */
export const SKIN_MESSAGE_TTL_MS = 10 * 60_000;

/**
 * The exact message a wallet signs to re-apply a skin it already owns.
 *
 * Lives here rather than in the route module because Next only permits route
 * handlers and a fixed set of config exports from a `route.ts`; it also has to
 * be byte-identical on both sides, so a single definition is the point.
 */
export function skinMessage(subject: string, skin: string, issuedAt: number): string {
  return [
    `Set my AttentionFi verification skin to "${skin}" for ${subject}.`,
    `Issued at: ${new Date(issuedAt).toISOString()}`,
    "This is free and does not authorise a payment.",
  ].join("\n");
}

/* ── the custom-artwork skin ─────────────────────────────────────────────── */

/**
 * A skin that replaces the generated gradient with artwork of your choosing.
 *
 * Deliberately not in `SKINS`: it has no palette, so every loop that renders
 * swatches or resolves a gradient would have to special-case it. Kept separate,
 * the existing code paths stay honest and this is handled where it differs.
 *
 * It isn't for sale. It unlocks once a wallet owns every other skin — the point
 * is that it can't be bought outright, only collected into.
 */
export const CUSTOM_SKIN_ID = "custom";

export const CUSTOM_SKIN = {
  id: CUSTOM_SKIN_ID,
  name: "Signature",
  blurb: "Your own artwork. Unlocks once you own every other skin.",
} as const;

/** True once `owned` covers the whole catalogue, which is what unlocks it. */
export function customSkinUnlocked(owned: readonly string[]): boolean {
  const set = new Set(owned);
  return SKINS.every((s) => set.has(s.id));
}

/** How many more skins a wallet needs before Signature unlocks. */
export function customSkinRemaining(owned: readonly string[]): number {
  const set = new Set(owned);
  return SKINS.filter((s) => !set.has(s.id)).length;
}

/**
 * Validate artwork supplied by a holder, returning a safe URL or null.
 *
 * https only. `http:` would break in wallets that refuse mixed content, and
 * `data:`/`javascript:` are rejected outright — this string is handed to
 * wallets and explorers to render, so it must be a plain remote image and
 * nothing that can carry a payload. Nothing fetches it server-side, so this is
 * about what we're willing to publish, not about SSRF.
 */
export function normalizeCustomUri(raw: string): string | null {
  const trimmed = raw.trim();
  // Core stores the uri in a bounded field, and this also rides in metadata.
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return url.toString();
}
