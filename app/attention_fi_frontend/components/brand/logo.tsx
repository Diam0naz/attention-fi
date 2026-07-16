import { cn } from "@/lib/utils";

/** The AttentionFi radar mark — a bullseye that pulses outward like a signal ping. */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center text-signal", className)}
      style={{ width: size, height: size }}
    >
      {/* expanding radar pings, staggered for a continuous sweep */}
      <span className="af-logo-ping" />
      <span className="af-logo-ping" style={{ animationDelay: "1.2s" }} />
      {/* static bullseye */}
      <svg viewBox="0 0 24 24" width={size} height={size} className="relative">
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.22" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.55" />
        <circle cx="12" cy="12" r="2.75" fill="currentColor" className="af-logo-core" />
      </svg>
    </span>
  );
}

/** Radar mark + ATTENTIONFI wordmark. */
export function Logo({
  size = 18,
  wordmark = true,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="font-mono text-[12px] font-bold tracking-[0.14em] text-signal">
          ATTENTIONFI
        </span>
      )}
    </span>
  );
}
