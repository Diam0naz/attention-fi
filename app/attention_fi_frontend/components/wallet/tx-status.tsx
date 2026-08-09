import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TxState = "pending" | "confirmed" | "failed";

export interface TxStatusProps {
  state: TxState;
  title: string;
  detail: string;
  signature?: string;
  explorerUrl?: string;
  onRetry?: () => void;
  /** Dismiss the notice. Omitted only where the caller clears it itself. */
  onDismiss?: () => void;
}

const TONE: Record<TxState, string> = {
  pending: "border-white/10",
  confirmed: "border-signal/25 bg-signal/[0.04]",
  failed: "border-noise/30 bg-noise/[0.05]",
};

export function TxStatus({
  state,
  title,
  detail,
  signature,
  explorerUrl,
  onRetry,
  onDismiss,
}: TxStatusProps) {
  return (
    <div className={cn("flex items-center gap-3 rounded-sm border p-3.5", TONE[state])}>
      {state === "pending" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-signal" />}
      {state === "confirmed" && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal text-[#0A0A0A]">
          <Check className="h-3 w-3" />
        </span>
      )}
      {state === "failed" && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-noise text-[#0A0A0A]">
          <X className="h-3 w-3" />
        </span>
      )}

      <div className="flex-1">
        <div className="text-[12.5px] font-bold">{title}</div>
        <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
          {detail}
          {signature ? ` · ${signature}` : ""}
        </div>
      </div>

      {state === "failed" && onRetry && (
        <button
          onClick={onRetry}
          className="rounded-sm border border-white/15 px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#F5F4F0]"
        >
          RETRY
        </button>
      )}
      {/* Shown on failure too, whenever there's a signature to look at. A
          failure that names a signature is precisely the case where the chain
          disagrees with this notice — the transaction may well have landed —
          and hiding the link left the one useful action unavailable. */}
      {explorerUrl && explorerUrl !== "#" && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "font-mono text-[10px]",
            state === "confirmed" ? "text-signal" : "text-[#6B6B6B]",
          )}
        >
          Solscan ↗
        </a>
      )}

      {/* A notice the reader can't dismiss is a notice that outlives its
          usefulness — it sat there until the next transaction replaced it. */}
      {onDismiss && state !== "pending" && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-sm p-1 text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-[#F5F4F0]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
