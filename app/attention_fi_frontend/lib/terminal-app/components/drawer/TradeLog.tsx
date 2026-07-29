"use client";

import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtClock } from "@/lib/terminal-app/lib/format";
import { useTrading } from "@/lib/terminal-app/stores/trading";
import { VirtualList } from "@/lib/terminal-app/components/ui/VirtualList";

const ROW_HEIGHT = 22;

export function TradeLog() {
  const log = useTrading((s) => s.log);

  if (log.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="text-2xs text-mid">No activity yet</span>
        <span className="text-2xs text-low">
          Your orders, fills and cancels. For on-chain activity across every token,
          see Network.
        </span>
      </div>
    );
  }

  return (
    <VirtualList
      items={log}
      rowHeight={ROW_HEIGHT}
      className="h-full"
      renderRow={(entry) => (
        <div
          key={entry.id}
          style={{ height: ROW_HEIGHT }}
          className="flex items-center gap-3 border-b border-edge px-3"
        >
          <span className="num w-16 shrink-0 text-2xs text-low">{fmtClock(entry.time)}</span>
          <span
            className={cn(
              "w-12 shrink-0 rounded px-1 text-center text-2xs uppercase",
              entry.kind === "fill" && "bg-up-muted text-up",
              entry.kind === "order" && "bg-tacc-muted text-tacc",
              entry.kind === "cancel" && "bg-down-muted text-down",
              entry.kind === "alert" && "bg-warn-muted text-warn",
            )}
          >
            {entry.kind}
          </span>
          <span className="num truncate text-2xs text-hi">{entry.message}</span>
        </div>
      )}
    />
  );
}
