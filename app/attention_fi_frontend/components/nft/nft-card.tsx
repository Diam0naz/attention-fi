import { BadgeCheck, TrendingUp, Gift } from "lucide-react";
import { TiltCard } from "@/components/reactbits/tilt-card";

export type NftCardData =
  | { kind: "verification"; handle: string; id?: string }
  | { kind: "perk"; level: number; discountBps: number; id?: string }
  | { kind: "genesis"; shareBps: number; id: string };

// Perk levels map to named tiers with their own palette (bronze → gold).
const PERK_TIERS = [
  { name: "Initiate", grad: "linear-gradient(150deg,#2b3340,#141a21)", accent: "#9fb2c6" },
  { name: "Trader", grad: "linear-gradient(150deg,#1e3a5f,#0e1b2c)", accent: "#5b8fff" },
  { name: "Pro", grad: "linear-gradient(150deg,#0f3d33,#08201b)", accent: "#00ff85" },
  { name: "Elite", grad: "linear-gradient(150deg,#0b4a2f,#05170f)", accent: "#3dffa0" },
  { name: "Apex", grad: "linear-gradient(150deg,#4a3a0b,#1a1404)", accent: "#f5b300" },
];

interface Visual {
  label: string;
  tag: string;
  grad: string;
  accent: string;
  tier: string;
  stat: string;
  statLabel: string;
  icon: React.ReactNode;
  id: string;
}

function resolve(data: NftCardData): Visual {
  if (data.kind === "verification") {
    return {
      label: "Verification",
      tag: "SOULBOUND",
      grad: "linear-gradient(150deg,#0f3d33,#071612)",
      accent: "#00ff85",
      tier: "Verified",
      stat: `@${data.handle}`,
      statLabel: "BOUND HANDLE",
      icon: <BadgeCheck className="h-6 w-6" />,
      id: data.id ?? "SBT-0001",
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
    };
  }
  return {
    label: "Genesis",
    tag: "TRANSFERABLE",
    grad: "linear-gradient(150deg,#2a1e4a,#120a24)",
    accent: "#5b8fff",
    tier: "Fee-share",
    stat: `${(data.shareBps / 100).toFixed(1)}%`,
    statLabel: "REVENUE SHARE",
    icon: <Gift className="h-6 w-6" />,
    id: data.id,
  };
}

export function NftCard({ data }: { data: NftCardData }) {
  const v = resolve(data);
  return (
    <TiltCard>
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border p-4 shadow-xl"
        style={{ background: v.grad, borderColor: `${v.accent}55` }}
      >
        {/* subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.4) 1px,transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide" style={{ color: v.accent }}>
            {v.icon}
            {v.label}
          </span>
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[7px] tracking-[0.1em]"
            style={{ borderColor: `${v.accent}55`, color: v.accent }}
          >
            {v.tag}
          </span>
        </div>

        <div className="relative mt-7 flex flex-col items-center" style={{ transform: "translateZ(40px)" }}>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border-2"
            style={{ borderColor: v.accent, color: v.accent, boxShadow: `0 0 24px ${v.accent}44` }}
          >
            {v.icon}
          </div>
          <div className="mt-3 text-center text-[16px] font-bold text-[#F5F4F0]">{v.tier}</div>
        </div>

        <div className="absolute inset-x-4 bottom-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/45">{v.statLabel}</div>
          <div className="truncate font-mono text-[15px] font-bold" style={{ color: v.accent }}>
            {v.stat}
          </div>
          <div className="mt-1 font-mono text-[8px] text-white/30">{v.id} · AttentionFi</div>
        </div>
      </div>
    </TiltCard>
  );
}
