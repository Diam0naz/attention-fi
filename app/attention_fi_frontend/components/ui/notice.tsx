import { AlertTriangle, Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline explanation attached to an action that can't be taken back.
 *
 * Three tones, and the distinction is about consequence rather than volume:
 *
 *   info    — how something works. The user can experiment freely.
 *   caution — costs money, or can't be undone without cost. Reversible, priced.
 *   danger  — permanent. No later transaction fixes it.
 *
 * Reserving `danger` for the genuinely irreversible is the whole point. An
 * interface that shouts about everything teaches people to click through
 * warnings, so by the time one actually matters it reads as noise. Most of
 * these should be `info`.
 *
 * Deliberately not a modal. These belong beside the control they describe,
 * visible while the user decides — a dialog that appears after they've chosen
 * arrives too late to inform the choice, and gets dismissed on reflex.
 */

export type NoticeTone = "info" | "caution" | "danger";

const TONE = {
  info: {
    icon: Info,
    border: "border-[#5b8fff]/25",
    bg: "bg-[#5b8fff]/[0.06]",
    accent: "text-[#5b8fff]",
  },
  caution: {
    icon: Lock,
    border: "border-signal/25",
    bg: "bg-signal/[0.05]",
    accent: "text-signal",
  },
  danger: {
    icon: AlertTriangle,
    border: "border-noise/30",
    bg: "bg-noise/[0.06]",
    accent: "text-noise",
  },
} as const satisfies Record<NoticeTone, unknown>;

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  /** Short enough to read at a glance — the body carries the detail. */
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = t.icon;

  return (
    <div
      className={cn("rounded-sm border px-3 py-2.5", t.border, t.bg, className)}
      // Permanent consequences are announced immediately; the rest waits its
      // turn so a screen reader isn't interrupted mid-sentence.
      role={tone === "danger" ? "alert" : "note"}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-[1px] h-3.5 w-3.5 shrink-0", t.accent)} aria-hidden />
        <div className="min-w-0">
          <div className={cn("font-mono text-[10px] font-bold tracking-[0.08em]", t.accent)}>
            {title}
          </div>
          {children && (
            <div className="mt-1 text-[11.5px] leading-relaxed text-[#9a9a9a]">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
