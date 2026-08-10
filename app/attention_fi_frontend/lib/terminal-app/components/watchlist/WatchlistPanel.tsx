"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { allTokenHandles, syncRegistry } from "@/lib/solana/registry";
import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtPercent, fmtPrice, fmtSigned } from "@/lib/terminal-app/lib/format";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import { useTokenLabel } from "@/lib/terminal-app/lib/token-label";
import type { TickerStats } from "@/lib/terminal-app/lib/types";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import {
  ATTENTIONFI_LIST,
  useWatchlist,
  type WatchlistSortKey,
} from "@/lib/terminal-app/stores/watchlist";
import { Select } from "@/lib/terminal-app/components/ui/Select";
import { Sparkline } from "./Sparkline";

export function WatchlistPanel() {
  const provider = useProvider();
  const lists = useWatchlist((s) => s.lists);
  const activeList = useWatchlist((s) => s.activeList);
  const setActiveList = useWatchlist((s) => s.setActiveList);
  const createList = useWatchlist((s) => s.createList);
  const deleteList = useWatchlist((s) => s.deleteList);
  const addSymbol = useWatchlist((s) => s.addSymbol);
  const removeSymbol = useWatchlist((s) => s.removeSymbol);
  const reorder = useWatchlist((s) => s.reorder);
  const sortKey = useWatchlist((s) => s.sortKey);
  const sortDir = useWatchlist((s) => s.sortDir);
  const setSort = useWatchlist((s) => s.setSort);

  const dismissed = useWatchlist((s) => s.dismissed);
  const dismiss = useWatchlist((s) => s.dismiss);

  const symbol = useSettings((s) => s.symbol);
  const setSymbol = useSettings((s) => s.setSymbol);
  const onChain = useSettings((s) => s.provider) === "attentionfi";

  // Every launched token, so a market that didn't exist when this list was
  // written still shows up in it. Curation still wins: anything explicitly
  // added keeps its position, and anything removed stays removed.
  const discovered = useLaunchedHandles(onChain && activeList === ATTENTIONFI_LIST);
  // Stable fallback: a fresh `[]` each render would defeat the memo below.
  const pinned = useMemo(() => lists[activeList] ?? NO_HANDLES, [lists, activeList]);
  const symbols = useMemo(() => {
    if (discovered.length === 0) return pinned;
    const seen = new Set(pinned);
    return [...pinned, ...discovered.filter((h) => !seen.has(h) && !dismissed.includes(h))];
  }, [pinned, discovered, dismissed]);

  const [adding, setAdding] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const { data: stats = [] } = useQuery({
    queryKey: ["watchlist-stats", provider.name, symbols],
    queryFn: () => provider.getTickerStats(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 4_000,
  });

  const bySymbol = new Map(stats.map((s) => [s.symbol, s]));
  let rows: { sym: string; stat: TickerStats | undefined }[] = symbols.map((sym) => ({
    sym,
    stat: bySymbol.get(sym),
  }));
  if (sortKey) {
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sortKey === "symbol") return a.sym.localeCompare(b.sym) * dir;
      const av = pick(a.stat, sortKey);
      const bv = pick(b.stat, sortKey);
      return (av - bv) * dir;
    });
  }
  const sortable = sortKey === null;

  return (
    <div className="flex h-full flex-col border-r border-edge bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-edge px-1.5">
        <Select
          value={activeList}
          options={Object.keys(lists).map((n) => ({ value: n, label: n }))}
          onChange={setActiveList}
          buttonClassName="flex-1"
        />
        <button
          type="button"
          title="New list"
          className="flex h-6 w-6 items-center justify-center rounded border border-edge bg-tinput text-mid transition-colors duration-150 hover:bg-hover hover:text-hi"
          onClick={() => {
            const name = window.prompt("List name");
            if (name) createList(name.trim());
          }}
        >
          +
        </button>
        <button
          type="button"
          title="Delete list"
          disabled={Object.keys(lists).length <= 1}
          className="flex h-6 w-6 items-center justify-center rounded border border-edge bg-tinput text-mid transition-colors duration-150 hover:bg-hover hover:text-down"
          onClick={() => deleteList(activeList)}
        >
          −
        </button>
      </div>

      <div className="grid grid-cols-[1fr_64px_72px] items-center gap-1 border-b border-edge px-2 py-1">
        <HeaderCell label="Symbol" k="symbol" active={sortKey} dir={sortDir} onSort={setSort} />
        <HeaderCell label="Last" k="last" active={sortKey} dir={sortDir} onSort={setSort} right />
        <HeaderCell label="Chg%" k="changePercent" active={sortKey} dir={sortDir} onSort={setSort} right />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map(({ sym, stat }, i) => (
          <WatchRow
            key={sym}
            sym={sym}
            stat={stat}
            active={sym === symbol}
            // Reorder indexes into the stored list, so dragging is only
            // meaningful while every visible row is a stored one.
            draggable={sortable && symbols.length === pinned.length}
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDrop={() => {
              if (dragIndex.current !== null && sortable) reorder(dragIndex.current, i);
              dragIndex.current = null;
            }}
            onSelect={() => setSymbol(sym)}
            onRemove={() => (pinned.includes(sym) ? removeSymbol(sym) : dismiss(sym))}
          />
        ))}
        {symbols.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-2 py-6 text-center">
            <span className="text-2xs text-mid">
              {onChain ? "No tokens found" : "Empty list"}
            </span>
            <span className="text-2xs text-low">
              {onChain ? "Launched tokens appear here automatically" : "Add a symbol below"}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-edge p-1.5">
        {adding ? (
          <input
            autoFocus
            placeholder={onChain ? "Add handle, e.g. king_diamonaz" : "Add symbol, e.g. BTCUSDT"}
            className="num h-6 w-full rounded border border-focus bg-tinput px-2 text-2xs text-hi outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) addSymbol(v);
                setAdding(false);
              } else if (e.key === "Escape") setAdding(false);
              e.stopPropagation();
            }}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className="h-6 w-full rounded border border-edge text-2xs text-low transition-colors duration-150 hover:border-edge-strong hover:bg-hover hover:text-hi"
            onClick={() => setAdding(true)}
          >
            + Add symbol
          </button>
        )}
      </div>
    </div>
  );
}

const NO_HANDLES: string[] = [];

/**
 * Every AttentionFi handle the registry knows, refreshed while the list is on
 * screen.
 *
 * Polled rather than fetched once: tokens are launched by other people while
 * the terminal sits open, and a watchlist that only learns about them on
 * reload is the thing this was meant to fix.
 */
function useLaunchedHandles(enabled: boolean): string[] {
  const [handles, setHandles] = useState<string[]>(NO_HANDLES);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      await syncRegistry().catch(() => undefined);
      if (cancelled) return;
      const next = allTokenHandles();
      // Same set, same reference — otherwise every poll invalidates the rows.
      setHandles((prev) => (prev.join(" ") === next.join(" ") ? prev : next));
    };
    void pull();
    const id = setInterval(() => void pull(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);

  return enabled ? handles : NO_HANDLES;
}

function pick(stat: TickerStats | undefined, key: WatchlistSortKey): number {
  if (!stat) return -Infinity;
  if (key === "last") return stat.last;
  if (key === "change") return stat.change;
  if (key === "changePercent") return stat.changePercent;
  return 0;
}

function HeaderCell({
  label,
  k,
  active,
  dir,
  onSort,
  right,
}: {
  label: string;
  k: WatchlistSortKey;
  active: WatchlistSortKey | null;
  dir: "asc" | "desc";
  onSort: (k: WatchlistSortKey) => void;
  right?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-0.5 text-2xs transition-colors duration-100",
        right && "justify-end",
        active === k ? "text-tacc" : "text-low hover:text-mid",
      )}
      onClick={() => onSort(k)}
    >
      {label}
      {active === k && <span>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

function WatchRow({
  sym,
  stat,
  active,
  draggable,
  onDragStart,
  onDrop,
  onSelect,
  onRemove,
}: {
  sym: string;
  stat: TickerStats | undefined;
  active: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { ticker, handle } = useTokenLabel(sym);
  const prevLast = useRef<number | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

  // flash-tint the row on price change, decaying via CSS animation. Runs after
  // commit (not during render) so the DOM write and the prev-price bookkeeping
  // don't double-fire under StrictMode/concurrent rendering.
  const last = stat?.last;
  useEffect(() => {
    if (last === undefined) return;
    const prev = prevLast.current;
    prevLast.current = last;
    if (prev === null || last === prev) return;
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth; // restart animation
    el.classList.add(last > prev ? "flash-up" : "flash-down");
  }, [last]);

  const up = (stat?.changePercent ?? 0) >= 0;

  return (
    <div
      ref={flashRef}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "group grid cursor-pointer grid-cols-[1fr_64px_72px] items-center gap-1 border-b border-edge px-2 py-1",
        "transition-colors duration-100 hover:bg-hover",
        active && "bg-tacc-muted",
      )}
      onClick={onSelect}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1">
          <span className="num truncate text-2xs font-medium text-hi" title={handle ?? sym}>
            {ticker}
          </span>
          {handle && <span className="num truncate text-2xs text-low">{handle}</span>}
          <button
            type="button"
            title={`Remove ${sym}`}
            className="hidden h-3.5 w-3.5 items-center justify-center rounded text-low transition-colors duration-100 hover:text-down group-hover:flex"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        </div>
        <Sparkline symbol={sym} up={up} />
      </div>
      <div className="flex flex-col items-end">
        <span className="num text-2xs text-hi">{stat ? fmtPrice(stat.last) : "—"}</span>
        <span className={cn("num text-2xs", up ? "text-up" : "text-down")}>
          {stat ? fmtSigned(stat.change) : ""}
        </span>
      </div>
      <span className={cn("num text-right text-2xs", up ? "text-up" : "text-down")}>
        {stat ? fmtPercent(stat.changePercent) : ""}
      </span>
    </div>
  );
}
