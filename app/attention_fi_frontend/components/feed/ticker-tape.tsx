const PHRASES = [
  "MINDSHARE IS THE ASSET",
  "BONDING CURVES MEET SOCIAL GRAPHS",
  "KAITO YAP SCORE → ON-CHAIN PRICE",
  "FAIR LAUNCH FOR KOL TOKENS",
  "CREATOR FEE SHARING",
  "GRADUATION TO AMM",
];

/** The signal-green marquee at the very top of the home page. Scrolls away
 *  normally so the sticky nav beneath it takes over cleanly. */
export function TickerTape() {
  const strip = [...PHRASES, ...PHRASES];
  return (
    <div className="overflow-hidden bg-signal py-1.75 text-[#0A0A0A]">
      <div className="af-ticker-track font-mono text-[11px] font-bold tracking-[0.08em]">
        {[0, 1].map((dup) => (
          <span key={dup} className="inline-flex">
            {strip.map((p, i) => (
              <span key={`${dup}-${i}`} className="px-6">
                {p}
                <span className="px-6 opacity-40">{"///"}</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
