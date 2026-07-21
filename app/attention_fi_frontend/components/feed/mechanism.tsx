import Link from "next/link";
import { Reveal } from "@/components/brand/reveal";

// Copy sourced from components/attentionfi-strategy.html (mechanism-design section).
const LAUNCH_TYPES = [
  { name: "Bonding Curve", badge: "DEFAULT", best: "KOL reputation tokens", desc: "Price rises continuously with buys — the Pump model, but seeded by real mindshare instead of zero." },
  { name: "Dutch Auction", badge: "FAIR", best: "Narrative / project launches", desc: "Price starts high and drops until the allocation sells. Kills front-running and bot advantage." },
  { name: "Conviction Curve", badge: "SLOW", best: "Niche verticals (music, gaming)", desc: "Slower acceleration with mandatory time-locks. Loyalty matters more than exit speed." },
  { name: "Revenue Share", badge: "NEW", best: "Creator economy tokens", desc: "Token = a claim on a share of the subject's future fees. Price is a DCF on attention revenue." },
];

const TIERS = [
  ["Top 10", "@vitalik, major KOL", "~$15,000"],
  ["Top 100", "Established crypto voice", "~$4,000"],
  ["Emerging (top 1K)", "Rising builder / analyst", "~$800"],
  ["Narrative token", "“AI agents”, “RWA summer”", "~$2,000"],
  ["New entrant", "Unknown account", "~$69"],
];

const FEES = [
  { value: "0.5%", label: "Creator fee", note: "Of all post-graduation volume, forever — claimable once the X owner verifies." },
  { value: "1.0%", label: "LP fee", note: "To graduation-phase liquidity providers, locked 30 days." },
  { value: "0.5%", label: "Protocol fee", note: "Treasury — funds the oracle and data infrastructure." },
];

export function Mechanism() {
  return (
    <section id="mechanism" className="mx-auto mt-24 max-w-5xl scroll-mt-16 px-5">
      <Reveal>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
          Mechanism design
        </div>
        <h2 className="mt-3 max-w-2xl text-[clamp(26px,4vw,40px)] font-bold leading-[1.1] tracking-[-0.02em]">
          The right curve for the right asset
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#9aa4af]">
          Pump uses one mechanism for everything. AttentionFi picks the mechanism to fit the
          underlying social primitive — four launch types, chosen at creation.
        </p>
      </Reveal>

      <Reveal delay={100} className="mt-8 grid gap-3 md:grid-cols-2">
        {LAUNCH_TYPES.map((m) => (
          <div key={m.name} className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold">{m.name}</span>
              <span className="rounded-sm border border-signal/40 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.08em] text-signal">
                {m.badge}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#9aa4af]">{m.desc}</p>
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              Best for → <span className="text-[#F5F4F0]">{m.best}</span>
            </div>
          </div>
        ))}
      </Reveal>

      <Reveal>
        {/* Mindshare seed tiers */}
        <h3 className="mt-10 text-[15px] font-bold">How mindshare seeds the price</h3>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#9aa4af]">
        The curve doesn&apos;t start at zero. It starts at a price proportional to the
        subject&apos;s existing mindshare rank — so a top-100 KOL token doesn&apos;t launch flat.
      </p>
      <div className="mt-4 overflow-hidden rounded-sm border border-white/[0.08]">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 bg-white/[0.03] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
          <span>Mindshare tier</span>
          <span className="hidden sm:block">Example</span>
          <span className="text-right">Seed market cap</span>
        </div>
        {TIERS.map(([tier, ex, seed]) => (
          <div key={tier} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-t border-white/[0.06] px-4 py-2.5 text-[12px]">
            <span className="font-medium text-[#F5F4F0]">{tier}</span>
            <span className="hidden text-[#6B6B6B] sm:block">{ex}</span>
            <span className="text-right font-mono text-signal">{seed}</span>
          </div>
        ))}
        </div>
      </Reveal>

      <Reveal>
        {/* Graduation fees */}
        <h3 className="mt-10 text-[15px] font-bold">The graduation path</h3>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#9aa4af]">
        At $69K a token graduates to a native AMM — and unlocks what Pump doesn&apos;t: the
        subject themselves earns from it.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {FEES.map((f) => (
          <div key={f.label} className="rounded-sm border border-white/[0.08] bg-[#0f1620]/80 p-4">
            <div className="font-mono text-[22px] font-bold text-signal">{f.value}</div>
            <div className="mt-1 text-[12px] font-bold">{f.label}</div>
            <div className="mt-1 text-[11px] leading-snug text-[#6B6B6B]">{f.note}</div>
          </div>
        ))}
      </div>

      <Link
        href="/#thesis"
        className="mt-8 inline-flex rounded-sm bg-signal px-5 py-3 font-mono text-[12px] font-bold text-[#0A0A0A]"
      >
        Join the waitlist →
      </Link>
      </Reveal>
    </section>
  );
}
