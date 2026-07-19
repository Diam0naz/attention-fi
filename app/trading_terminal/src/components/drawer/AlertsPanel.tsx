"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { fmtClock, fmtPrice } from "@/lib/format";
import { useAlerts } from "@/stores/alerts";
import { useSettings } from "@/stores/settings";
import { useTrading } from "@/stores/trading";

export function AlertsPanel() {
  const alerts = useAlerts((s) => s.alerts);
  const addAlert = useAlerts((s) => s.addAlert);
  const removeAlert = useAlerts((s) => s.removeAlert);
  const symbol = useSettings((s) => s.symbol);
  const mark = useTrading((s) => s.marks[symbol]);

  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const priceNum = parseFloat(price) || 0;

  return (
    <div className="flex h-full">
      <div className="flex w-64 shrink-0 flex-col gap-2 border-r border-edge p-3">
        <span className="text-2xs font-medium uppercase tracking-wider text-low">
          New price alert
        </span>
        <div className="num text-xs text-hi">{symbol}</div>
        <div className="grid grid-cols-2 gap-1 rounded border border-edge bg-input p-0.5">
          {(["above", "below"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={cn(
                "h-6 rounded-sm text-2xs capitalize transition-colors duration-150",
                d === direction
                  ? "bg-accent-muted text-accent"
                  : "text-mid hover:bg-hover hover:text-hi",
              )}
              onClick={() => setDirection(d)}
            >
              Crosses {d}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="0"
          step="any"
          value={price}
          placeholder={mark !== undefined ? fmtPrice(mark) : "Price"}
          className="num h-7 rounded border border-edge bg-input px-2 text-right text-xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          type="button"
          disabled={priceNum <= 0}
          className="h-7 rounded bg-accent text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
          onClick={() => {
            addAlert(symbol, priceNum, direction);
            setPrice("");
          }}
        >
          Create alert
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6">
            <span className="text-2xs text-mid">No alerts</span>
            <span className="text-2xs text-low">Create one for {symbol} on the left</span>
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between border-b border-edge px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "led",
                    a.triggeredAt !== null ? "led-down" : "led-live",
                  )}
                />
                <span className="num text-2xs text-hi">{a.symbol}</span>
                <span className="text-2xs text-low">crosses {a.direction}</span>
                <span className="num text-2xs text-mid">{fmtPrice(a.price)}</span>
              </div>
              <div className="flex items-center gap-2">
                {a.triggeredAt !== null && (
                  <span className="num text-2xs text-warn">
                    fired {fmtClock(a.triggeredAt)}
                  </span>
                )}
                <button
                  type="button"
                  className="h-5 rounded border border-edge px-1.5 text-2xs text-mid transition-colors duration-150 hover:border-edge-strong hover:text-down"
                  onClick={() => removeAlert(a.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
