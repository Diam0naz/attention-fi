"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getHolders, getMentions, type TokenDetail } from "@/lib/mock-data";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

/**
 * Design 1b — "Mindshare-First": leads with social proof and the graduation
 * gauge instead of the data-dense chart terminal (1a).
 */
export function MindshareView({ token }: { token: TokenDetail }) {
  const mentions = useMemo(() => getMentions(token.handle), [token.handle]);
  const holders = useMemo(() => getHolders(token.handle), [token.handle]);
  const gradPct = Math.min(100, Math.round((token.raisedUsd / token.targetUsd) * 100));

  // creator / top-10 / others split for the distribution bar
  const creator = holders.find((h) => h.tag === "creator")?.pct ?? 0;
  const top10 = holders.filter((h) => !h.tag).reduce((a, h) => a + h.pct, 0);
  const others = Math.max(0, 100 - creator - top10);
  const dist = [
    { label: "creator", pct: creator, color: "bg-signal" },
    { label: "top 10", pct: top10, color: "bg-pulse" },
    { label: "others", pct: others, color: "bg-white/25" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* headline mindshare stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { v: `${token.mindshare.toFixed(2)}%`, k: "MINDSHARE", accent: true },
          { v: `#${token.rank}`, k: "RANK" },
          { v: `${token.delta24h >= 0 ? "+" : ""}${token.delta24h.toFixed(1)}%`, k: "24H", up: token.delta24h >= 0 },
        ].map((s) => (
          <div key={s.k} className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
            <div
              className={cn(
                "font-mono text-[24px] font-bold",
                s.accent && "text-signal",
                s.up === true && "text-signal",
                s.up === false && "text-noise",
              )}
            >
              {s.v}
            </div>
            <div className="mt-1 font-mono text-[9px] tracking-[0.1em] text-[#6B6B6B]">{s.k}</div>
          </div>
        ))}
      </div>

      {/* social proof */}
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
          Recent mentions feeding the score
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {mentions.map((m, i) => (
            <div key={i} className="border-l-2 border-signal/40 pl-3">
              <p className="text-[13px] leading-relaxed text-[#d7dde3]">{m.text}</p>
              <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
                {m.ago} · {m.impressions.toLocaleString()} impressions
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-white/[0.06] pt-3 font-mono text-[9px] text-[#4b5563]">
          sourced from Kaito-style mindshare feed · Phase 0 mock data
        </div>
      </div>

      {/* graduation gauge */}
      <div className="rounded-sm border border-signal/25 bg-signal/[0.04] p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[34px] font-bold leading-none text-signal">{gradPct}%</div>
            <div className="mt-1.5 font-mono text-[9px] tracking-[0.1em] text-[#6B6B6B]">TO GRADUATION</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[16px] font-bold">{usd(token.raisedUsd)}</div>
            <div className="font-mono text-[10px] text-[#6B6B6B]">/ {usd(token.targetUsd)} mkt cap</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${gradPct}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-[#6B6B6B]">graduates to a native AMM at threshold</div>
      </div>

      {/* holder distribution */}
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">Holder distribution</div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
          {dist.map((d) => (
            <div key={d.label} className={cn("h-full", d.color)} style={{ width: `${d.pct}%` }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 font-mono text-[11px]">
          {dist.map((d) => (
            <span key={d.label} className="inline-flex items-center gap-1.5 text-[#9aa4af]">
              <span className={cn("h-2 w-2 rounded-full", d.color)} />
              {d.label} <span className="text-[#F5F4F0]">{d.pct.toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
