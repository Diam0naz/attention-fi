"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useDrawings, type DrawingTool } from "@/stores/drawings";
import { useSettings } from "@/stores/settings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

export const DRAWING_TOOLS: { tool: DrawingTool; label: string; shortcut?: string }[] = [
  { tool: "trendline", label: "Trendline", shortcut: "Alt+T" },
  { tool: "ray", label: "Ray" },
  { tool: "hline", label: "Horizontal Line", shortcut: "Alt+H" },
  { tool: "vline", label: "Vertical Line" },
  { tool: "rect", label: "Rectangle" },
  { tool: "fib-retracement", label: "Fib Retracement", shortcut: "Alt+F" },
  { tool: "fib-extension", label: "Fib Extension" },
  { tool: "text", label: "Text" },
  { tool: "measure", label: "Measure" },
];

export function DrawingToolsMenu() {
  const [open, setOpen] = useState(false);
  const activeTool = useDrawings((s) => s.activeTool);
  const setActiveTool = useDrawings((s) => s.setActiveTool);
  const clearSymbol = useDrawings((s) => s.clearSymbol);
  const symbol = useSettings((s) => s.symbol);
  const count = useDrawings((s) => (s.bySymbol[symbol] ?? []).length);

  const active = DRAWING_TOOLS.find((t) => t.tool === activeTool);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-6 items-center gap-1 rounded border px-2 text-xs",
          "transition-colors duration-150",
          activeTool
            ? "border-focus bg-accent-muted text-accent"
            : "border-edge bg-input text-hi hover:border-edge-strong hover:bg-hover",
        )}
      >
        {active ? active.label : "Draw"}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1">
        {DRAWING_TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            className={cn(
              "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-xs",
              "transition-colors duration-100 hover:bg-hover",
              t.tool === activeTool ? "text-accent" : "text-hi",
            )}
            onClick={() => {
              setActiveTool(t.tool === activeTool ? null : t.tool);
              setOpen(false);
            }}
          >
            {t.label}
            {t.shortcut && <kbd className="text-2xs text-low">{t.shortcut}</kbd>}
          </button>
        ))}
        <div className="mt-1 border-t border-edge pt-1">
          <button
            type="button"
            disabled={count === 0}
            className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-xs text-down transition-colors duration-100 hover:bg-hover"
            onClick={() => {
              clearSymbol(symbol);
              setOpen(false);
            }}
          >
            Clear drawings
            <span className="num text-2xs text-low">{count}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
