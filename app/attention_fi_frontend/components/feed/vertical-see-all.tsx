"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface VerticalTokenSummary {
  handle: string;
  label: string;
  mindshare: string;
  delta: string;
  verified?: boolean;
  positive?: boolean;
}

export const DEFAULT_TOKENS: VerticalTokenSummary[] = [
  { handle: "@solana_kol", label: "Solana Maxi", mindshare: "3.24%", delta: "+41%", verified: true, positive: true },
  { handle: "@degen_pilled", label: "Degen Pilled", mindshare: "0.81%", delta: "+8%", verified: true, positive: true },
  { handle: "@mev_searcher", label: "MEV Searcher", mindshare: "0.58%", delta: "+3%", positive: true },
  { handle: "@base_degen", label: "Base Degen", mindshare: "0.32%", delta: "-6%", positive: false },
  { handle: "@liquidity_wiz", label: "Liquidity Wizard", mindshare: "0.29%", delta: "+2%", positive: true },
  { handle: "@yield_farmer", label: "Yield Farmer", mindshare: "0.24%", delta: "+1%", positive: true },
  { handle: "@vault_ape", label: "Vault Ape", mindshare: "0.19%", delta: "-3%", positive: false },
  { handle: "@perp_nomad", label: "Perp Nomad", mindshare: "0.15%", delta: "+1%", positive: true },
];

const SORTS = ["MINDSHARE", "24H CHANGE", "VERIFIED ONLY"];

/** Full grid view reached via the "SEE ALL →" link on a feed vertical shelf
 *  (Feed / DeFi / AI-Tech shelves) — see Token Trading Page.dc.html #6c. */
export function VerticalSeeAll({
  vertical,
  totalCount,
  tokens = DEFAULT_TOKENS,
  remainingCount,
  onLoadMore,
  onSelectToken,
}: {
  vertical: string;
  totalCount: number;
  tokens?: VerticalTokenSummary[];
  remainingCount?: number;
  onLoadMore?: () => void;
  onSelectToken?: (handle: string) => void;
}) {
  const [sortIdx, setSortIdx] = useState(0);
  const num = (s: string) => Number.parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;

  // 0 = sort by mindshare, 1 = sort by 24h change, 2 = verified only.
  const displayed = useMemo(() => {
    if (sortIdx === 2) return tokens.filter((t) => t.verified);
    const key = sortIdx === 1 ? "delta" : "mindshare";
    return [...tokens].sort((a, b) => num(b[key]) - num(a[key]));
  }, [tokens, sortIdx]);

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <div className="font-mono text-[10px] tracking-[0.12em] text-[#6B6B6B]">VERTICAL</div>
          <h1 className="mt-1.5 text-[26px] font-bold tracking-tight">{vertical}</h1>
          <p className="mt-1.5 text-[12px] text-[#6B6B6B]">
            {totalCount} handles · curated by mindshare velocity
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map((s, i) => (
            <button
              key={s}
              onClick={() => setSortIdx(i)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 font-mono text-[10px] transition-colors",
                i === sortIdx
                  ? "border border-signal/50 bg-signal/10 text-signal"
                  : "border border-white/10 text-[#6B6B6B] hover:text-[#F5F4F0]",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {displayed.length === 0 && (
        <p className="px-7 py-12 text-center font-mono text-[12px] text-[#6B6B6B]">
          No handles match this filter.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-7 lg:grid-cols-4">
        {displayed.map((t) => (
          <button
            key={t.handle}
            onClick={() => onSelectToken?.(t.handle)}
            className="rounded-sm border border-white/[0.08] p-3.5 text-left transition-colors hover:border-white/20"
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-[13px] font-bold">{t.handle}</span>
              {t.verified && (
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-signal text-[8px] font-bold text-black">
                  ✓
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-[10px] text-[#6B6B6B]">{t.label}</div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className={cn("font-mono text-[13px]", t.positive ? "text-signal" : "text-noise")}>
                {t.mindshare}
              </span>
              <span className={cn("font-mono text-[10px]", t.positive ? "text-signal" : "text-noise")}>
                {t.delta}
              </span>
            </div>
            <div
              className="mt-2 h-5 rounded-sm"
              style={{
                background: t.positive
                  ? "linear-gradient(90deg, rgba(0,255,133,.15), rgba(0,255,133,.35))"
                  : "linear-gradient(90deg, rgba(255,59,92,.15), rgba(255,59,92,.3))",
              }}
            />
          </button>
        ))}
      </div>

      {remainingCount != null && remainingCount > 0 && (
        <div className="flex justify-center px-7 pb-7">
          <button
            onClick={onLoadMore}
            className="rounded-sm border border-white/10 px-5 py-2.5 font-mono text-[11px] text-[#9AA4AF] transition-colors hover:border-white/20"
          >
            LOAD MORE ({remainingCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
