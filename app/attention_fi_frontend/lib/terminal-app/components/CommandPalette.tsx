"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import { TIMEFRAMES, type ChartType } from "@/lib/terminal-app/lib/types";
import { useDrawings, type DrawingTool } from "@/lib/terminal-app/stores/drawings";
import { useLayout } from "@/lib/terminal-app/stores/layout";
import { useSettings, type GridLayout } from "@/lib/terminal-app/stores/settings";
import { useTrading } from "@/lib/terminal-app/stores/trading";
import { Modal } from "@/lib/terminal-app/components/ui/Modal";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const provider = useProvider();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const settings = useSettings.getState();
    const layout = useLayout.getState();
    const drawings = useDrawings.getState();
    const list: Command[] = [];

    for (const tf of TIMEFRAMES) {
      list.push({
        id: `tf-${tf}`,
        group: "Timeframe",
        label: `Timeframe: ${tf}`,
        run: () => settings.setTimeframe(tf),
      });
    }
    const chartTypes: [ChartType, string][] = [
      ["candles", "Candles"],
      ["heikin-ashi", "Heikin-Ashi"],
      ["hollow", "Hollow candles"],
      ["line", "Line"],
      ["area", "Area"],
      ["bars", "Bars"],
    ];
    for (const [value, label] of chartTypes) {
      list.push({
        id: `ct-${value}`,
        group: "Chart type",
        label: `Chart type: ${label}`,
        run: () => settings.setChartType(value),
      });
    }
    const tools: [DrawingTool, string, string?][] = [
      ["trendline", "Trendline", "Alt+T"],
      ["ray", "Ray"],
      ["hline", "Horizontal line", "Alt+H"],
      ["vline", "Vertical line"],
      ["rect", "Rectangle"],
      ["fib-retracement", "Fib retracement", "Alt+F"],
      ["fib-extension", "Fib extension"],
      ["text", "Text annotation"],
      ["measure", "Measure"],
    ];
    for (const [tool, label, hint] of tools) {
      list.push({
        id: `dt-${tool}`,
        group: "Draw",
        label: `Draw: ${label}`,
        ...(hint !== undefined ? { hint } : {}),
        run: () => drawings.setActiveTool(tool),
      });
    }
    const grids: [GridLayout, string][] = [
      ["1", "Single chart"],
      ["2h", "2 charts horizontal"],
      ["2v", "2 charts vertical"],
      ["4", "4-chart grid"],
    ];
    for (const [value, label] of grids) {
      list.push({
        id: `grid-${value}`,
        group: "Layout",
        label: `Layout: ${label}`,
        run: () => settings.setGridLayout(value),
      });
    }
    list.push(
      {
        id: "toggle-theme",
        group: "Appearance",
        label: "Toggle dark / light theme",
        run: () => settings.toggleTheme(),
      },
      {
        id: "toggle-left",
        group: "Layout",
        label: "Toggle watchlist rail",
        run: () => layout.toggleLeft(),
      },
      {
        id: "toggle-right",
        group: "Layout",
        label: "Toggle right rail",
        run: () => layout.toggleRight(),
      },
      {
        id: "toggle-drawer",
        group: "Layout",
        label: "Toggle bottom drawer",
        run: () => layout.toggleDrawer(),
      },
      {
        id: "provider-attentionfi",
        group: "Data",
        label: "Data source: AttentionFi devnet",
        run: () => settings.setProvider("attentionfi"),
      },
      {
        id: "provider-binance",
        group: "Data",
        label: "Data source: Binance",
        run: () => settings.setProvider("binance"),
      },
      {
        id: "provider-mock",
        group: "Data",
        label: "Data source: offline mock",
        run: () => settings.setProvider("mock"),
      },
      {
        id: "flatten",
        group: "Trading",
        label: `Flatten position (${settings.symbol})`,
        hint: "Shift+F",
        run: () => useTrading.getState().closePosition(useSettings.getState().symbol),
      },
      {
        id: "cancel-all",
        group: "Trading",
        label: `Cancel all working orders (${settings.symbol})`,
        hint: "Shift+X",
        run: () => useTrading.getState().cancelAll(useSettings.getState().symbol),
      },
      {
        id: "screener",
        group: "Panels",
        label: "Open screener",
        run: () => layout.openDrawer("screener"),
      },
      {
        id: "alerts",
        group: "Panels",
        label: "Open alerts",
        run: () => layout.openDrawer("alerts"),
      },
      {
        id: "log",
        group: "Panels",
        label: "Open trade log",
        run: () => layout.openDrawer("log"),
      },
    );
    return list;
    // rebuilt each time the palette opens so labels reflect current state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter((c) => isSubsequence(q, c.label.toLowerCase()))
    : commands;

  const { data: symbolResults = [] } = useQuery({
    queryKey: ["palette-symbols", provider.name, q],
    queryFn: () => provider.searchSymbols(q),
    enabled: open && q.length >= 2,
    placeholderData: (prev) => prev,
  });

  const symbolCommands: Command[] = symbolResults.slice(0, 6).map((s) => ({
    id: `sym-${s.symbol}`,
    group: "Symbols",
    label: s.symbol,
    hint: s.description,
    run: () => useSettings.getState().setSymbol(s.symbol),
  }));

  const all = [...symbolCommands, ...filtered];
  const clampedHighlight = Math.min(highlight, Math.max(0, all.length - 1));

  const execute = (cmd: Command) => {
    cmd.run();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} top="16vh">
      <input
        autoFocus
        value={query}
        placeholder="Type a command or symbol…"
        spellCheck={false}
        className="h-10 w-full border-b border-edge bg-transparent px-4 text-sm text-hi outline-none placeholder:text-low"
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, all.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            const cmd = all[clampedHighlight];
            if (cmd) execute(cmd);
          }
        }}
      />
      <div className="max-h-80 overflow-y-auto p-1">
        {all.length === 0 && (
          <div className="px-3 py-4 text-center text-2xs text-low">No matching commands</div>
        )}
        {all.map((cmd, i) => (
          <button
            key={cmd.id}
            type="button"
            className={cn(
              "flex w-full items-center justify-between rounded px-3 py-1.5 text-left",
              "transition-colors duration-100",
              i === clampedHighlight ? "bg-tacc-muted" : "hover:bg-hover",
            )}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => execute(cmd)}
          >
            <span className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-2xs uppercase tracking-wide text-low">
                {cmd.group}
              </span>
              <span className="text-xs text-hi">{cmd.label}</span>
            </span>
            {cmd.hint && <span className="text-2xs text-low">{cmd.hint}</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}
