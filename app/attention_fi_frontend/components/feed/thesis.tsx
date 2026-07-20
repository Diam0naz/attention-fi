import { GradientText } from "@/components/reactbits/text";
import { Reveal } from "@/components/brand/reveal";

// Copy sourced from components/attentionfi-strategy.html (product thesis section).
const STATS = [
  { value: "$138M/mo", label: "Pump.fun revenue peak — from one mechanism on one chain. The template works." },
  { value: "98.5%", label: "Of Pump tokens fail. No underlying signal = no floor. Ours have a real anchor." },
  { value: "200M+", label: "Kaito posts indexed daily. The data layer exists — just untokenised at the account level." },
  { value: "$1.3M vol", label: "Kaito + Polymarket attention markets already drew real demand." },
];

export function Thesis() {
  return (
    <section id="thesis" className="mx-auto mt-24 max-w-5xl scroll-mt-16 px-5">
      <Reveal>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
          Product thesis
        </div>
        <h2 className="mt-3 max-w-2xl text-[clamp(26px,4vw,40px)] font-bold leading-[1.1] tracking-[-0.02em]">
          Pump.fun got one thing right. <GradientText>The feed.</GradientText>
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#9aa4af]">
          Attention is the scarcest resource on the internet. Pump tokenised it for random
          images. We tokenise it where it actually concentrates — the X social graph.
        </p>
      </Reveal>

      <Reveal delay={100} className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
          <div className="text-[13px] font-bold text-noise">Where Pump breaks</div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#9aa4af]">
            Pump collapsed create → trade → speculate into one frictionless flow. But its
            underlying asset is nothing — a JPEG and a name. The price has no anchor outside
            the curve itself. Fine for pure speculation; the wrong tool for creator economies,
            reputation markets, or narrative bets.
          </p>
        </div>
        <div className="rounded-sm border border-signal/25 bg-signal/[0.04] p-5">
          <div className="text-[13px] font-bold text-signal">The anchor we add</div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#9aa4af]">
            The X graph has a real underlying signal: mindshare. It&apos;s measurable (Kaito
            indexes 200M+ posts daily), it moves in real time, and it&apos;s predictive of
            price. Mindshare is zero-sum within a timeframe — when one account&apos;s share of
            the conversation rises, another&apos;s falls. <span className="text-[#F5F4F0]">That
            dynamic is the curve.</span> You&apos;re betting on relative attention velocity, not a meme.
          </p>
        </div>
      </Reveal>

      <Reveal delay={160} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.value} className="rounded-sm border border-white/[0.08] bg-[#0f1620]/80 p-4">
            <div className="font-mono text-[20px] font-bold text-signal">{s.value}</div>
            <div className="mt-1.5 text-[11px] leading-snug text-[#6B6B6B]">{s.label}</div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
