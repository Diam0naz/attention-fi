"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtCompact, fmtPercent, fmtPrice } from "@/lib/terminal-app/lib/format";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { VirtualList } from "@/lib/terminal-app/components/ui/VirtualList";

type SortKey = "symbol" | "last" | "changePercent" | "quoteVolume";

const ROW_HEIGHT = 24;

/**
 * Market screener over 24h ticker stats: USDT pairs, filterable by minimum
 * quote volume and gainers/losers, sortable, virtualized, click loads the
 * chart.
 */
export function Screener() {
  const provider = useProvider();
  const setSymbol = useSettings((s) => s.setSymbol);
  const [sortKey, setSortKey] = useState<SortKey>("quoteVolume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minVolume, setMinVolume] = useState(1_000_000);
  const [direction, setDirection] = useState<"all" | "gainers" | "losers">("all");

  const { data: stats = [], isLoading } = useQuery({
    queryKey: ["screener", provider.name],
    queryFn: () => provider.getTickerStats(),
    refetchInterval: 15_000,
  });

  const rows = useMemo(() => {
    const filtered = stats.filter((s) => {
      if (!s.symbol.endsWith("USDT")) return false;
      if (s.quoteVolume < minVolume) return false;
      if (direction === "gainers" && s.changePercent <= 0) return false;
      if (direction === "losers" && s.changePercent >= 0) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
    return filtered;
  }, [stats, sortKey, sortDir, minVolume, direction]);

  const sort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-edge px-2 py-1">
        <div className="flex items-center rounded border border-edge bg-tinput p-0.5">
          {(["all", "gainers", "losers"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-2xs capitalize transition-colors duration-150",
                d === direction
                  ? "bg-tacc-muted text-tacc"
                  : "text-mid hover:bg-hover hover:text-hi",
              )}
              onClick={() => setDirection(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-2xs text-low">
          Min vol
          <input
            type="number"
            value={minVolume}
            step={500_000}
            min={0}
            className="num h-5 w-24 rounded border border-edge bg-tinput px-1 text-right text-2xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
            onChange={(e) => setMinVolume(parseFloat(e.target.value) || 0)}
          />
        </label>
        <span className="num text-2xs text-low">{rows.length} results</span>
      </div>

      <div className="grid shrink-0 grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] gap-1 border-b border-edge px-2 py-1">
        <Th label="Symbol" k="symbol" cur={sortKey} dir={sortDir} onSort={sort} />
        <Th label="Last" k="last" cur={sortKey} dir={sortDir} onSort={sort} right />
        <Th label="Chg%" k="changePercent" cur={sortKey} dir={sortDir} onSort={sort} right />
        <span className="text-right text-2xs text-low">High</span>
        <span className="text-right text-2xs text-low">Low</span>
        <Th label="Volume" k="quoteVolume" cur={sortKey} dir={sortDir} onSort={sort} right />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded-sm bg-hover" />
          ))}
        </div>
      ) : (
        <VirtualList
          items={rows}
          rowHeight={ROW_HEIGHT}
          className="min-h-0 flex-1"
          renderRow={(s) => (
            <button
              key={s.symbol}
              type="button"
              style={{ height: ROW_HEIGHT }}
              className="grid w-full grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-1 px-2 text-left transition-colors duration-100 hover:bg-hover"
              onClick={() => setSymbol(s.symbol)}
            >
              <span className="num truncate text-2xs font-medium text-hi">{s.symbol}</span>
              <span className="num text-right text-2xs text-hi">{fmtPrice(s.last)}</span>
              <span
                className={cn(
                  "num text-right text-2xs",
                  s.changePercent >= 0 ? "text-up" : "text-down",
                )}
              >
                {fmtPercent(s.changePercent)}
              </span>
              <span className="num text-right text-2xs text-mid">{fmtPrice(s.high)}</span>
              <span className="num text-right text-2xs text-mid">{fmtPrice(s.low)}</span>
              <span className="num text-right text-2xs text-mid">{fmtCompact(s.quoteVolume)}</span>
            </button>
          )}
        />
      )}
    </div>
  );
}

function Th({
  label,
  k,
  cur,
  dir,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-0.5 text-2xs transition-colors duration-100",
        right && "justify-end",
        cur === k ? "text-tacc" : "text-low hover:text-mid",
      )}
      onClick={() => onSort(k)}
    >
      {label}
      {cur === k && <span>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}
