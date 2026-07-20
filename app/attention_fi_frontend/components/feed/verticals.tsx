import Link from "next/link";
import { Reveal } from "@/components/brand/reveal";
import { verticalSlug } from "@/lib/mock-data";

// Copy sourced from components/attentionfi-strategy.html (competitive-moat, vertical curation).
const VERTICALS = [
  { name: "DeFi", blurb: "Protocol founders, yield analysts, governance voices." },
  { name: "AI/Tech", blurb: "Agent builders, model researchers, the narrative layer." },
  { name: "ZK/Infra", blurb: "Provers, rollup teams, the modular stack." },
  { name: "Gaming", blurb: "Studios, guilds, on-chain game economies." },
  { name: "Music", blurb: "Artists and scenes where loyalty beats exit speed." },
  { name: "Narrative", blurb: "“RWA summer”, “AI agents” — themes, not accounts." },
];

export function Verticals() {
  return (
    <section id="verticals" className="mx-auto mt-24 max-w-5xl scroll-mt-16 px-5">
      <Reveal>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
          Vertical curation
        </div>
        <h2 className="mt-3 max-w-2xl text-[clamp(26px,4vw,40px)] font-bold leading-[1.1] tracking-[-0.02em]">
          One roof, many mini-economies
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#9aa4af]">
          Pump is one horizontal feed fighting for the same generic attention. AttentionFi runs
          a separate flywheel per niche — each with its own KOLs, community, and discovery — so
          they compound instead of cannibalising each other. Curation is a moat, not a filter.
        </p>
      </Reveal>

      <Reveal delay={100} className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VERTICALS.map((v) => (
          <Link
            key={v.name}
            href={`/discover/${verticalSlug(v.name)}`}
            className="group rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 transition-colors hover:border-signal/30"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              <span className="text-[13px] font-bold">{v.name}</span>
              <span className="ml-auto font-mono text-[10px] text-[#4b5563] transition-colors group-hover:text-signal">
                →
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#6B6B6B]">{v.blurb}</p>
          </Link>
        ))}
      </Reveal>

      <Reveal delay={160}>
        <p className="mt-6 max-w-xl text-[12px] leading-relaxed text-[#6B6B6B]">
          Plus two structural moats a fork can&apos;t copy: the subject of each token is its own
          organic distribution channel, and every verified X handle is bound on-chain — so the
          original, legitimate token can&apos;t be faked.
        </p>
      </Reveal>
    </section>
  );
}
