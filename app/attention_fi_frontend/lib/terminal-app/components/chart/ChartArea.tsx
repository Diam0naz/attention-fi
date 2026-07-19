"use client";

import { ChartWorkspace } from "@/lib/terminal-app/components/chart/ChartWorkspace";
import { cn } from "@/lib/terminal-app/lib/cn";
import { useSettings } from "@/lib/terminal-app/stores/settings";

/**
 * Multi-chart grid: 1, 2-horizontal, 2-vertical or 4 panes. Pane 0 follows the
 * active symbol; the rest use the configured grid symbols (or the active
 * symbol when sync is on).
 */
export function ChartArea() {
  const gridLayout = useSettings((s) => s.gridLayout);
  const symbol = useSettings((s) => s.symbol);
  const gridSymbols = useSettings((s) => s.gridSymbols);
  const sync = useSettings((s) => s.syncCrosshair);

  const paneSymbol = (i: number): string => {
    if (i === 0 || sync) return symbol;
    return gridSymbols[i - 1] ?? symbol;
  };

  const count = gridLayout === "1" ? 1 : gridLayout === "4" ? 4 : 2;

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
        <div key={`${gridLayout}-${i}`} className="min-h-0 min-w-0 overflow-hidden">
          <ChartWorkspace
            workspaceId={`g${i}`}
            symbol={paneSymbol(i)}
            isPrimary={i === 0}
          />
        </div>
      ))}
    </div>
  );
}
