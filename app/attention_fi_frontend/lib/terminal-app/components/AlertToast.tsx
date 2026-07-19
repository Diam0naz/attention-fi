"use client";

import { useEffect } from "react";
import { fmtPrice } from "@/lib/terminal-app/lib/format";
import { useAlerts } from "@/lib/terminal-app/stores/alerts";
import { useTrading } from "@/lib/terminal-app/stores/trading";

/**
 * Fired-alert toast: full-saturation colors are reserved for exactly this.
 * Auto-dismisses after six seconds; also logs to the trade log.
 */
export function AlertToast() {
  const lastTriggered = useAlerts((s) => s.lastTriggered);
  const ack = useAlerts((s) => s.ackTriggered);

  useEffect(() => {
    if (!lastTriggered) return;
    useTrading
      .getState()
      .appendLog(
        "alert",
        `Alert: ${lastTriggered.symbol} crossed ${lastTriggered.direction} ${fmtPrice(lastTriggered.price)}`,
      );
    const t = setTimeout(ack, 6000);
    return () => clearTimeout(t);
  }, [lastTriggered, ack]);

  if (!lastTriggered) return null;

  const up = lastTriggered.direction === "above";
  return (
    <div className="pop-in fixed bottom-4 right-4 z-[80] flex items-center gap-3 rounded-md border border-edge-strong bg-overlay px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
      <span
        className="led"
        style={{
          background: up ? "var(--tk-up-alert)" : "var(--tk-down-alert)",
          boxShadow: `0 0 8px ${up ? "var(--tk-up-alert)" : "var(--tk-down-alert)"}`,
        }}
      />
      <div className="flex flex-col">
        <span className="num text-xs font-medium text-hi">
          {lastTriggered.symbol} crossed {lastTriggered.direction}{" "}
          {fmtPrice(lastTriggered.price)}
        </span>
        <span className="text-2xs text-low">Price alert triggered</span>
      </div>
      <button
        type="button"
        className="ml-2 flex h-5 w-5 items-center justify-center rounded text-mid transition-colors duration-100 hover:bg-hover hover:text-hi"
        onClick={ack}
      >
        <svg width="9" height="9" viewBox="0 0 10 10">
          <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
