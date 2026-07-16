import Link from "next/link";
import { Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WaitlistButton } from "@/components/waitlist/waitlist-button";
import Strands from "@/components/reactbits/strands";
import { MagicCircle } from "@/components/reactbits/magic-circle";
import { GradientText, ShinyText } from "@/components/reactbits/text";
import { CountUp } from "@/components/reactbits/count-up";

const NAV = [
  { label: "Feed", href: "#feed" },
  { label: "Thesis", href: "#thesis" },
  { label: "Mechanism", href: "#mechanism" },
  { label: "Verticals", href: "#verticals" },
];

const STATS = [
  { value: 138, prefix: "$", suffix: "M", label: "Pump.fun peak / mo" },
  { value: 200, prefix: "", suffix: "M+", label: "Kaito posts / day" },
  { value: 69, prefix: "$", suffix: "K", label: "Graduation to AMM" },
];

export function Hero() {
  return (
    <>
      {/* Tighter, full-bleed divider with a constrained inner row (phase0 style). */}
      <nav className="border-b border-white/[0.08]">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3">
          <a href="#feed" aria-label="AttentionFi home">
            <Logo />
          </a>
          <span className="rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-[#6B6B6B]">
            PHASE 0 · PREVIEW
          </span>
          <ul className="ml-2 hidden gap-5 text-[12px] text-[#6B6B6B] lg:flex">
            {NAV.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="transition-colors hover:text-[#F5F4F0]">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <label className="ml-auto hidden items-center gap-2 rounded-sm border border-white/10 bg-[#12181f] px-2.5 py-1.5 md:flex">
            <Search className="h-3.5 w-3.5 text-[#6B6B6B]" />
            <input
              placeholder="Search handles, narratives…"
              className="w-48 bg-transparent text-[12px] text-[#F5F4F0] outline-none placeholder:text-[#4b5563]"
            />
          </label>
          <Link
            href="/launch"
            className="ml-auto font-mono text-[11px] font-bold text-[#F5F4F0] transition-colors hover:text-signal md:ml-0"
          >
            Launch →
          </Link>
          <WaitlistButton />
        </div>
      </nav>

      <header className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <Strands
            colors={["#00ff85", "#7cffc4", "#0d7351"]}
            count={5}
            speed={0.4}
            amplitude={1.6}
            waviness={2.2}
            thickness={0.8}
            glow={2.6}
            taper={2.8}
            spread={1.3}
            intensity={0.55}
            saturation={1.4}
            scale={2}
          />
        </div>
        <MagicCircle className="pointer-events-none absolute -right-20 -top-16 hidden h-[380px] w-[380px] opacity-60 lg:block" />

        <div className="relative mx-auto max-w-5xl px-5 py-14">
          <ShinyText className="font-mono text-[11px] uppercase tracking-[0.18em]">
            Pump.fun for X
          </ShinyText>
          <h1 className="mt-4 max-w-2xl text-[clamp(34px,5.5vw,58px)] font-bold leading-[1.04] tracking-[-0.03em]">
            Attention is the asset. <GradientText>Trade it.</GradientText>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#9aa4af]">
            Every row below is a tradeable attention asset — seeded by real on-chain
            social data, priced by a bonding curve, tradeable the instant you connect.
          </p>

          <div className="mt-9 grid max-w-xl grid-cols-3 gap-2.5">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-sm border border-white/[0.08] bg-[#0f1620]/80 p-3.5 backdrop-blur-sm"
              >
                <CountUp
                  value={s.value}
                  prefix={s.prefix}
                  suffix={s.suffix}
                  className="font-mono text-[21px] font-bold text-signal"
                />
                <div className="mt-1 text-[10px] leading-tight text-[#6B6B6B]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>
    </>
  );
}
