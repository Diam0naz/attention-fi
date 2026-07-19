"use client";

import { useEffect } from "react";
import { FOCUS_SYMBOL_SEARCH_EVENT } from "@/lib/terminal-app/components/topbar/SymbolSearch";
import { TIMEFRAMES } from "@/lib/terminal-app/lib/types";
import { useDrawings } from "@/lib/terminal-app/stores/drawings";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { useTrading } from "@/lib/terminal-app/stores/trading";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useKeyboard({
  openPalette,
  openShortcuts,
}: {
  openPalette: () => void;
  openShortcuts: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);

      // palette works everywhere
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (typing) return;

      const settings = useSettings.getState();
      const drawings = useDrawings.getState();

      // undo / redo on drawings
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) drawings.redo(settings.symbol);
        else drawings.undo(settings.symbol);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        drawings.redo(settings.symbol);
        return;
      }

      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "t") {
          e.preventDefault();
          drawings.setActiveTool("trendline");
        } else if (key === "h") {
          e.preventDefault();
          drawings.setActiveTool("hline");
        } else if (key === "f") {
          e.preventDefault();
          drawings.setActiveTool("fib-retracement");
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;

      // hotkey trading: Shift + B/S/F/X on the active symbol
      if (e.shiftKey) {
        const trading = useTrading.getState();
        const symbol = settings.symbol;
        const key = e.key.toLowerCase();
        if (key === "b" || key === "s") {
          const mark = trading.marks[symbol];
          if (mark !== undefined) {
            e.preventDefault();
            trading.placeOrder({
              symbol,
              side: key === "b" ? "buy" : "sell",
              type: "market",
              qty: trading.defaultQty,
              price: mark,
            });
          }
          return;
        }
        if (key === "f") {
          e.preventDefault();
          trading.closePosition(symbol);
          return;
        }
        if (key === "x") {
          e.preventDefault();
          trading.cancelAll(symbol);
          return;
        }
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          window.dispatchEvent(new Event(FOCUS_SYMBOL_SEARCH_EVENT));
          return;
        case "?":
          e.preventDefault();
          openShortcuts();
          return;
        case "Escape":
          if (drawings.activeTool) drawings.setActiveTool(null);
          else if (drawings.selectedId) drawings.select(null);
          return;
        case "Delete":
        case "Backspace":
          if (drawings.selectedId) {
            e.preventDefault();
            drawings.deleteDrawing(settings.symbol, drawings.selectedId);
          }
          return;
        case " ":
          e.preventDefault();
          settings.toggleCrosshairLock();
          return;
        default:
          break;
      }

      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < TIMEFRAMES.length) {
        const tf = TIMEFRAMES[idx];
        if (tf) settings.setTimeframe(tf);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, openShortcuts]);
}
