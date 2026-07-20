"use client";

import { cn } from "@/lib/terminal-app/lib/cn";
import { useLayout, type RightTab } from "@/lib/terminal-app/stores/layout";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { AttentionOrderEntry } from "./AttentionOrderEntry";
import { OrderBook } from "./OrderBook";
import { OrderEntry } from "./OrderEntry";
import { Positions } from "./Positions";
import { TimeAndSales } from "./TimeAndSales";

const TABS: { id: RightTab; label: string }[] = [
  { id: "book", label: "Book" },
  { id: "tape", label: "Tape" },
  { id: "order", label: "Trade" },
  { id: "positions", label: "Positions" },
];

export function RightRail() {
  const tab = useLayout((s) => s.rightTab);
  const setTab = useLayout((s) => s.setRightTab);
  // on the AttentionFi source, the ticket trades the real bonding curve
  const onChain = useSettings((s) => s.provider) === "attentionfi";

  return (
    <div className="flex h-full flex-col border-l border-edge bg-panel">
      <div className="flex h-8 shrink-0 items-center border-b border-edge px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "h-6 rounded px-2 text-xs transition-colors duration-150",
              t.id === tab ? "bg-tacc-muted text-tacc" : "text-mid hover:bg-hover hover:text-hi",
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "book" && <OrderBook />}
        {tab === "tape" && <TimeAndSales />}
        {tab === "order" && (onChain ? <AttentionOrderEntry /> : <OrderEntry />)}
        {tab === "positions" && <Positions />}
      </div>
    </div>
  );
}
