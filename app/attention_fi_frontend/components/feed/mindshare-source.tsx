import { cn } from "@/lib/utils";
import type { MindshareSource } from "@/lib/mindshare-engine";

/**
 * Marks whether a mindshare number was MEASURED from a real social source or
 * SIMULATED by the deterministic engine. The catalog deliberately mixes real
 * accounts with illustrative ones, and the two must never read as equivalent —
 * a simulated number is a plausible-looking fiction, not an observation.
 */

const LABELS: Record<Exclude<MindshareSource, "engine">, string> = {
  farcaster: "Farcaster",
  x: "𝕏",
  kaito: "Kaito",
};

/**
 * Deliberately conservative: an absent source reads as simulated. On first
 * paint the index hasn't fetched yet, and if no aggregator is configured these
 * handles genuinely are engine-driven — so a row only claims "measured" once a
 * real source has actually returned a value for it.
 */
export function isMeasured(source?: MindshareSource): boolean {
  return Boolean(source) && source !== "engine";
}

export function sourceTitle(source?: MindshareSource): string {
  return isMeasured(source)
    ? `Measured — live ${LABELS[source as Exclude<MindshareSource, "engine">] ?? source} conversation volume`
    : "Simulated — illustrative handle with no live social data";
}

/** Compact dot for dense rows: filled = measured, hollow = simulated. */
export function MindshareDot({
  source,
  className,
}: {
  source?: MindshareSource;
  className?: string;
}) {
  const measured = isMeasured(source);
  return (
    <span
      title={sourceTitle(source)}
      aria-label={sourceTitle(source)}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        measured ? "bg-signal" : "border border-white/25 bg-transparent",
        className,
      )}
    />
  );
}

/** Full pill for detail views, where there's room to say it outright. */
export function MindshareSourceBadge({
  source,
  className,
}: {
  source?: MindshareSource;
  className?: string;
}) {
  const measured = isMeasured(source);
  return (
    <span
      title={sourceTitle(source)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em]",
        measured
          ? "border-signal/40 text-signal"
          : "border-white/15 text-[#6B6B6B]",
        className,
      )}
    >
      <MindshareDot source={source} />
      {measured
        ? `Measured · ${LABELS[source as Exclude<MindshareSource, "engine">] ?? source}`
        : "Simulated"}
    </span>
  );
}

/** Legend for list views that show both kinds side by side. */
export function MindshareLegend({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span className="inline-flex items-center gap-1.5">
        <MindshareDot source="farcaster" />
        measured
      </span>
      <span className="inline-flex items-center gap-1.5">
        <MindshareDot source="engine" />
        simulated
      </span>
    </span>
  );
}
