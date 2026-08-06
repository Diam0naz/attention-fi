import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID } from "@/lib/solana/config";
import { skinById, type Skin } from "@/lib/nft-skins";
import { decodeAsset } from "@/lib/solana/nft-data";
import type { SkinClass } from "@/lib/skin-db";

/**
 * Shared reads for the dynamic perk/genesis metadata routes.
 *
 * Both classes work the same way as the verification badge: the asset's
 * on-chain `uri` points at an endpoint that resolves the artwork at read time,
 * so restyling is a row update rather than a transaction. Both PDAs are keyed
 * by the asset, so the asset address is the natural identifier.
 *
 * Facts come from the PDA, never from the URL, so metadata can't be spoofed by
 * requesting someone else's asset with attacker-chosen traits.
 */

const PERK_SEED = Buffer.from("perk");
const GENESIS_SEED = Buffer.from("genesis");

export function isSkinClass(s: string): s is SkinClass {
  return s === "perk" || s === "genesis";
}

export interface NftFacts {
  cls: SkinClass;
  asset: string;
  owner: string;
  /** Perk level, 1-5. Perk only. */
  level?: number;
  /** Fee discount in basis points. Perk only. */
  discountBps?: number;
  /** Fee share in basis points. Genesis only. */
  shareBps?: number;
  /** The token whose fee stream this NFT shares. Genesis only. A share figure
   *  without it doesn't say what it's a share *of*. */
  subjectMint?: string;
}

/** Read the on-chain record behind an asset, or null when there isn't one. */
export async function readNftFacts(cls: SkinClass, asset: string): Promise<NftFacts | null> {
  let assetKey: PublicKey;
  try {
    assetKey = new PublicKey(asset);
  } catch {
    return null;
  }

  const program = getReadonlyProgram();
  const seed = cls === "perk" ? PERK_SEED : GENESIS_SEED;
  const [pda] = PublicKey.findProgramAddressSync([seed, assetKey.toBuffer()], PROGRAM_ID);

  try {
    if (cls === "perk") {
      const a = await program.account.perkNft.fetch(pda);
      return {
        cls,
        asset,
        owner: a.owner.toBase58(),
        level: a.level,
        discountBps: a.discountBps,
      };
    }
    const a = await program.account.genesisNft.fetch(pda);
    return {
      cls,
      asset,
      owner: a.owner.toBase58(),
      shareBps: a.shareBps,
      subjectMint: a.subjectMint.toBase58(),
    };
  } catch {
    return null;
  }
}

/**
 * Each class's own palette, used when no skin has been chosen.
 *
 * Mirrors the card colours in nft-card.tsx: a perk's tier gradient and
 * genesis's gold. An unskinned NFT should look like the design, not like the
 * verification badge.
 */
const PERK_TIERS: { name: string; from: string; to: string; accent: string }[] = [
  { name: "Initiate", from: "#1c2530", to: "#222d3a", accent: "#9fb2c6" },
  { name: "Trader", from: "#08241d", to: "#0b2b22", accent: "#00ff85" },
  { name: "Pro", from: "#0a1428", to: "#0c1a33", accent: "#4a80ff" },
  { name: "Elite", from: "#1a0f38", to: "#20143f", accent: "#b07cff" },
  { name: "Apex", from: "#1e1704", to: "#241a06", accent: "#f5b300" },
];

const GENESIS_DEFAULT = { name: "Genesis", from: "#1e1704", to: "#241a06", accent: "#f5b300" };

/** Palette for an asset: its chosen skin, else the class's designed default. */
export function paletteFor(facts: NftFacts, skinId: string | null): Skin {
  if (skinId) return skinById(skinId);
  if (facts.cls === "perk") {
    const tier = PERK_TIERS[Math.min(PERK_TIERS.length, Math.max(1, facts.level ?? 1)) - 1]!;
    return { id: "tier", blurb: "", ...tier };
  }
  return { id: "genesis", blurb: "", ...GENESIS_DEFAULT };
}

/**
 * Read a plain mpl-core asset account.
 *
 * Standalone NFTs have no program PDA describing them, so their name and owner
 * have to come from the Core account itself. Used by the /api/nft/custom
 * routes, which is what an asset points at when its creator supplied no
 * artwork of their own.
 */
export async function readCoreAsset(
  asset: string,
): Promise<{ owner: string; name: string; uri: string; collection: string | null } | null> {
  let key: PublicKey;
  try {
    key = new PublicKey(asset);
  } catch {
    return null;
  }
  const program = getReadonlyProgram();
  const info = await program.provider.connection.getAccountInfo(key);
  // Key::AssetV1 is discriminant 1; anything else is a collection, or not ours.
  if (!info || info.data[0] !== 1) return null;
  return decodeAsset(info.data);
}

/** Escape text interpolated into SVG — never trust a value into markup. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
