"use client";

import { ChartWorkspace } from "@/lib/terminal-app/components/chart/ChartWorkspace";
import { cn } from "@/lib/terminal-app/lib/cn";
import { PANE_COUNT, useSettings } from "@/lib/terminal-app/stores/settings";

/**
 * Multi-chart grid: 1, 2-horizontal, 2-vertical or 4 panes.
 *
 * Every pane charts its own symbol, and clicking one focuses it: the search
 * box, order ticket, book and tape all follow the focused pane. Without that
 * there was no way to fill a second pane at all — it showed whatever the store
 * had been seeded with and nothing could change it.
 *
 * With sync on, the panes deliberately collapse onto one symbol; that switch
 * is for comparing timeframes of a single market, not two markets.
 */
export function ChartArea() {
  const gridLayout = useSettings((s) => s.gridLayout);
  const symbol = useSettings((s) => s.symbol);
  const paneSymbols = useSettings((s) => s.paneSymbols);
  const activePane = useSettings((s) => s.activePane);
  const setActivePane = useSettings((s) => s.setActivePane);
  const sync = useSettings((s) => s.syncCrosshair);

  const count = PANE_COUNT[gridLayout];
  const paneSymbol = (i: number): string => (sync ? symbol : (paneSymbols[i] ?? symbol));

  return (
    <div
      className={cn(
        "grid h-full w-full gap-px bg-edge",
        gridLayout === "1" && "grid-cols-1 grid-rows-1",
        gridLayout === "2h" && "grid-cols-2 grid-rows-1",
        gridLayout === "2v" && "grid-cols-1 grid-rows-2",
        gridLayout === "4" && "grid-cols-2 grid-rows-2",
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ChartWorkspace
          key={`${gridLayout}-${i}`}
          workspaceId={`g${i}`}
          symbol={paneSymbol(i)}
          // A single pane is always the focused one, so it gets no ring —
          // highlighting the only thing on screen says nothing.
          isActive={i === activePane}
          showFocus={count > 1}
          onActivate={() => setActivePane(i)}
        />
      ))}
    </div>
  );
}
