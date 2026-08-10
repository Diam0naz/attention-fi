"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/terminal-app/lib/cn";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import { useTokenLabel } from "@/lib/terminal-app/lib/token-label";
import { useSettings } from "@/lib/terminal-app/stores/settings";

export const FOCUS_SYMBOL_SEARCH_EVENT = "tt:focus-symbol-search";

export function SymbolSearch() {
  const provider = useProvider();
  const setSymbol = useSettings((s) => s.setSymbol);
  const gridLayout = useSettings((s) => s.gridLayout);
  const activePane = useSettings((s) => s.activePane);
  const { ticker } = useTokenLabel();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["symbol-search", provider.name, query],
    queryFn: () => provider.searchSymbols(query),
    enabled: open,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const onFocusEvent = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener(FOCUS_SYMBOL_SEARCH_EVENT, onFocusEvent);
    return () => window.removeEventListener(FOCUS_SYMBOL_SEARCH_EVENT, onFocusEvent);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // The highlighted row is an index into a list that both of these change, so
  // it resets whenever either does — during render, since a stale index can
  // point past the end of the new results.
  const [prevKey, setPrevKey] = useState(`${query}:${open}`);
  const key = `${query}:${open}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setHighlight(0);
  }

  const choose = (sym: string) => {
    setSymbol(sym);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const openList = () => {
    setOpen(true);
    setRect(wrapRef.current?.getBoundingClientRect() ?? null);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          "flex h-7 w-52 items-center gap-1.5 rounded border border-edge bg-tinput px-2",
          "transition-colors duration-150 focus-within:border-focus hover:border-edge-strong",
        )}
      >
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          placeholder={ticker}
          spellCheck={false}
          autoComplete="off"
          className="num w-full bg-transparent text-xs text-hi outline-none placeholder:text-mid"
          onFocus={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            openList();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              const pick = results[highlight];
              if (pick) choose(pick.symbol);
              else if (query.trim()) choose(query.trim());
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {/* Which chart this search will change. Without it, typing a symbol in
            a split view silently retargets whichever pane was last clicked. */}
        {gridLayout !== "1" && (
          <span
            title={`Searching changes pane ${activePane + 1}. Click another chart to retarget.`}
            className="num shrink-0 rounded border border-edge bg-elevated px-1 text-2xs text-tacc"
          >
            P{activePane + 1}
          </span>
        )}
        <kbd className="rounded border border-edge bg-elevated px-1 text-2xs text-low">/</kbd>
      </div>
      {open &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: 320,
              zIndex: 60,
            }}
            className="tt-root pop-in max-h-80 overflow-y-auto rounded-md border border-edge-strong bg-overlay p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          >
            {results.length === 0 && (
              <div className="px-2 py-3 text-center text-2xs text-low">No matches</div>
            )}
            {results.map((r, i) => (
              <button
                key={r.symbol}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left",
                  "transition-colors duration-100",
                  i === highlight ? "bg-tacc-muted" : "hover:bg-hover",
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(r.symbol)}
              >
                <span className="num shrink-0 text-xs text-hi">{r.base || r.symbol}</span>
                <span className="truncate pl-3 text-2xs text-low">{r.description}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" className="shrink-0 text-low">
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 8 L11 11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
