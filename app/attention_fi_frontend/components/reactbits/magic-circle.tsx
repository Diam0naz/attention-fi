interface MagicCircleProps {
  className?: string;
}

const SIGNAL = "var(--signal)";

/** Rotating concentric rings + ticks + orbiting nodes — a "magic circle" motif.
 *  Pure SVG with CSS-driven rotation (no JS); frozen under reduced-motion. */
export function MagicCircle({ className }: MagicCircleProps) {
  const ticks = Array.from({ length: 48 });
  const runes = Array.from({ length: 3 });

  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden fill="none">
      {/* soft core glow */}
      <circle cx="100" cy="100" r="20" fill={SIGNAL} opacity="0.06" />

      {/* outer dashed ring, slow */}
      <g className="af-orbit">
        <circle cx="100" cy="100" r="92" stroke={SIGNAL} strokeOpacity="0.18" strokeWidth="0.5" strokeDasharray="2 6" />
        <circle cx="100" cy="100" r="78" stroke={SIGNAL} strokeOpacity="0.12" strokeWidth="0.5" />
      </g>

      {/* tick ring, reverse */}
      <g className="af-orbit-rev">
        {ticks.map((_, i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const r1 = i % 4 === 0 ? 64 : 68;
          const r2 = 72;
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * r1}
              y1={100 + Math.sin(a) * r1}
              x2={100 + Math.cos(a) * r2}
              y2={100 + Math.sin(a) * r2}
              stroke={SIGNAL}
              strokeOpacity={i % 4 === 0 ? 0.4 : 0.15}
              strokeWidth="0.6"
            />
          );
        })}
      </g>

      {/* inner ring + orbiting nodes, faster */}
      <g className="af-orbit-fast">
        <circle cx="100" cy="100" r="52" stroke={SIGNAL} strokeOpacity="0.25" strokeWidth="0.6" />
        {runes.map((_, i) => {
          const a = (i / runes.length) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={100 + Math.cos(a) * 52}
              cy={100 + Math.sin(a) * 52}
              r="2.4"
              fill={SIGNAL}
              opacity="0.7"
            />
          );
        })}
      </g>

      {/* crosshair */}
      <line x1="100" y1="40" x2="100" y2="160" stroke={SIGNAL} strokeOpacity="0.06" strokeWidth="0.5" />
      <line x1="40" y1="100" x2="160" y2="100" stroke={SIGNAL} strokeOpacity="0.06" strokeWidth="0.5" />
    </svg>
  );
}
