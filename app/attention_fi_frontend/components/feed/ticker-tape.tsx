const PHRASES = [
  "MINDSHARE IS THE ASSET",
  "BONDING CURVES MEET SOCIAL GRAPHS",
  "KAITO YAP SCORE → ON-CHAIN PRICE",
  "FAIR LAUNCH FOR KOL TOKENS",
  "CREATOR FEE SHARING",
  "GRADUATION TO AMM",
];

/** The sticky signal-green marquee at the top of the app. */
export function TickerTape() {
  const strip = [...PHRASES, ...PHRASES];
  return (
    <div className="sticky top-0 z-50 overflow-hidden bg-signal py-[7px] text-[#0A0A0A]">
      <div className="af-ticker-track font-mono text-[11px] font-bold tracking-[0.08em]">
        {[0, 1].map((dup) => (
          <span key={dup} className="inline-flex">
            {strip.map((p, i) => (
              <span key={`${dup}-${i}`} className="px-6">
                {p}
                <span className="px-6 opacity-40">///</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
