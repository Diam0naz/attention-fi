"use client";

import { BadgeCheck, TrendingUp, Gift, Image as ImageIcon } from "lucide-react";
import { TiltCard } from "@/components/reactbits/tilt-card";
import { useDominantColor } from "@/lib/use-dominant-color";
import { skinById } from "@/lib/nft-skins";

export type NftCardData =
  /** `skinId` restyles the badge; omitted or unknown falls back to the default. */
  | { kind: "verification"; handle: string; id?: string; skinId?: string | null }
  | { kind: "perk"; level: number; discountBps: number; id?: string }
  | { kind: "genesis"; shareBps: number; id: string; image?: string }
  | { kind: "custom"; name: string; image?: string; id?: string };

// Perk levels map to named tiers with their own palette (bronze → gold).
// 3-stop gradients with a vivid mid band that sweeps via .af-nft-grad.
const PERK_TIERS = [
  { name: "Initiate", grad: "linear-gradient(120deg,#1c2530,#41556b,#222d3a)", accent: "#9fb2c6" }, // steel
  { name: "Trader", grad: "linear-gradient(120deg,#08241d,#0aa06a,#0b2b22)", accent: "#00ff85" }, // green
  { name: "Pro", grad: "linear-gradient(120deg,#0a1428,#1e3f8f,#0c1a33)", accent: "#4a80ff" }, // dark blue
  { name: "Elite", grad: "linear-gradient(120deg,#1a0f38,#7d3fd6,#20143f)", accent: "#b07cff" }, // violet
  { name: "Apex", grad: "linear-gradient(120deg,#1e1704,#d99a12,#241a06)", accent: "#f5b300" }, // gold
];

export interface NftVisual {
  label: string;
  tag: string;
  grad: string;
  accent: string;
  tier: string;
  stat: string;
  statLabel: string;
  icon: React.ReactNode;
  id: string;
  blurb: string;
  /** Optional full-bleed artwork (standalone collectibles / skins). */
  image?: string;
}

export function getNftVisual(data: NftCardData): NftVisual {
  if (data.kind === "verification") {
    // The badge's palette is the one part of it that's mutable; skinById
    // degrades an unknown or removed id to the default rather than rendering
    // a half-styled card.
    const s = skinById(data.skinId);
    return {
      label: "Verification",
      tag: "SOULBOUND",
      grad: `linear-gradient(120deg,${s.from},${s.accent}33,${s.to})`,
      accent: s.accent,
      tier: "Verified",
      stat: `@${data.handle}`,
      statLabel: "BOUND HANDLE",
      icon: <BadgeCheck className="h-6 w-6" />,
      id: data.id ?? "SBT-0001",
      blurb: "A non-transferable SAS credential binding your X handle to this wallet. Gates creator-fee claims; can never be sold or moved.",
    };
  }
  if (data.kind === "perk") {
    const t = PERK_TIERS[Math.min(PERK_TIERS.length, Math.max(1, data.level)) - 1]!;
    return {
      label: "Perk",
      tag: "UPGRADEABLE",
      grad: t.grad,
      accent: t.accent,
      tier: `${t.name} · Lvl ${data.level}`,
      stat: `${(data.discountBps / 100).toFixed(0)}% off`,
      statLabel: "FEE DISCOUNT",
      icon: <TrendingUp className="h-6 w-6" />,
      id: data.id ?? `PERK-${String(data.level).padStart(4, "0")}`,
      blurb: "An upgradeable trading perk. Each level rewrites its on-chain Attributes for +1% fee discount, capped at 5%.",
    };
  }
  if (data.kind === "genesis") {
    return {
      label: "Genesis",
      tag: "TRANSFERABLE",
      grad: "linear-gradient(120deg,#05302a,#1fe0b8,#0a4038)",
      accent: "#3fe9c4",
      tier: "Fee-share",
      stat: `${(data.shareBps / 100).toFixed(1)}%`,
      statLabel: "REVENUE SHARE",
      icon: <Gift className="h-6 w-6" />,
      id: data.id,
      blurb: "A transferable fee-share NFT earning a pro-rata cut of the subject's fee stream, forever. Trade it or hold to accrue.",
      // Optional subject artwork. Left unset, the card keeps the fee-share
      // gradient above — the default is a designed state, not a placeholder.
      image: data.image,
    };
  }
  return {
    label: "NFT",
    tag: "COLLECTIBLE",
    grad: "linear-gradient(120deg,#1a1230,#5b3fd6,#241a45)",
    accent: "#b07cff",
    tier: data.name || "Untitled",
    stat: "1 of 1",
    statLabel: "EDITION",
    icon: <ImageIcon className="h-6 w-6" />,
    id: data.id ?? "NFT-0001",
    blurb: "A standalone Metaplex Core collectible — freely transferable, with its own artwork.",
    image: data.image,
  };
}

/** The card visual only (no tilt) — reused by the tilt card and the lanyard. */
export function NftCardFace({ data }: { data: NftCardData }) {
  const v = getNftVisual(data);
  // Artwork-derived accent, when the image is readable. The designed accent is
  // the fallback, not a placeholder — most hosts don't send CORS headers, so
  // this stays null often and the card must look right either way.
  const derived = useDominantColor(v.image);
  const accent = derived ?? v.accent;
  return (
    <div
      className="af-nft-grad relative aspect-[3/4] w-full overflow-hidden rounded-xl border p-4 shadow-xl transition-colors duration-500"
      style={{ background: v.grad, borderColor: `${accent}77` }}
    >
      {/* full-bleed artwork (standalone collectibles / skins) */}
      {v.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.image} alt={v.tier} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.4) 1px,transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* sweeping light sheen */}
      <div
        className="af-nft-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3"
        style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)" }}
      />
      {/* bottom scrim keeps the footer text readable over the vivid gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 to-transparent" />
      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>
          {v.icon}
          {v.label}
        </span>
        <span className="rounded-full border px-2 py-0.5 font-mono text-[7px] tracking-[0.1em]" style={{ borderColor: `${accent}55`, color: accent }}>
          {v.tag}
        </span>
      </div>
      {/* center emblem — hidden when full-bleed artwork is present */}
      {!v.image && (
        <div className="relative mt-7 flex flex-col items-center" style={{ transform: "translateZ(40px)" }}>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border-2"
            style={{ borderColor: accent, color: accent, boxShadow: `0 0 24px ${accent}44` }}
          >
            {v.icon}
          </div>
          <div className="mt-3 text-center text-[16px] font-bold text-[#F5F4F0]">{v.tier}</div>
        </div>
      )}
      <div className="absolute inset-x-4 bottom-4">
        <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/45">{v.statLabel}</div>
        <div className="truncate font-mono text-[15px] font-bold" style={{ color: accent }}>
          {v.stat}
        </div>
        <div className="mt-1 font-mono text-[8px] text-white/30">{v.id} · AttentionFi</div>
      </div>
    </div>
  );
}

export function NftCard({ data, onClick }: { data: NftCardData; onClick?: () => void }) {
  return (
    <TiltCard>
      <button type="button" onClick={onClick} className="block w-full cursor-pointer text-left">
        <NftCardFace data={data} />
      </button>
    </TiltCard>
  );
}
