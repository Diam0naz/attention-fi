"use client";

import { cn } from "@/lib/terminal-app/lib/cn";
import { useLayout, type DrawerTab } from "@/lib/terminal-app/stores/layout";
import { AlertsPanel } from "./AlertsPanel";
import { Screener } from "./Screener";
import { TradeLog } from "./TradeLog";

const TABS: { id: DrawerTab; label: string }[] = [
  { id: "screener", label: "Screener" },
  { id: "alerts", label: "Alerts" },
  { id: "log", label: "Trade Log" },
];

export function BottomDrawer() {
  const tab = useLayout((s) => s.drawerTab);
  const setTab = useLayout((s) => s.setDrawerTab);
  const toggle = useLayout((s) => s.toggleDrawer);

  return (
    <div className="flex h-full flex-col border-t border-edge bg-panel">
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
        <div className="flex-1" />
        <button
          type="button"
          title="Collapse drawer"
          className="flex h-6 w-6 items-center justify-center rounded text-mid transition-colors duration-150 hover:bg-hover hover:text-hi"
          onClick={toggle}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "screener" && <Screener />}
        {tab === "alerts" && <AlertsPanel />}
        {tab === "log" && <TradeLog />}
      </div>
    </div>
  );
}
