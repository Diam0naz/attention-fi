import { cn } from "@/lib/utils";

export interface StateCardProps {
  tone: "neutral" | "error";
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  emphasizeAction?: boolean;
}

/** One shared shape for empty states and error states (feed filters, rejected
 *  signatures, insufficient balance, RPC failures) — see
 *  Token Trading Page.dc.html #12d for the reference grid. */
export function StateCard({
  tone,
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  emphasizeAction,
}: StateCardProps) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
      <div
        className={cn(
          "font-mono text-[9px] tracking-[0.1em]",
          tone === "error" ? "text-noise" : "text-[#6B6B6B]",
        )}
      >
        {eyebrow}
      </div>
      <div className="mt-2 text-[12.5px] font-bold">{title}</div>
      <p className="mt-1 text-[11.5px] text-[#6B6B6B]">{description}</p>
      <button
        onClick={onAction}
        className={cn(
          "mt-2.5 font-mono text-[10.5px] font-bold",
          emphasizeAction
            ? "rounded-sm bg-signal px-3 py-1.5 text-[#0A0A0A]"
            : tone === "error"
              ? "rounded-sm border border-white/15 px-3 py-1.5 text-[#F5F4F0]"
              : "text-signal",
        )}
      >
        {actionLabel}
      </button>
    </div>
  );
}
