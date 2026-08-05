"use client";

import { useEffect, useMemo, useState } from "react";
import { MindshareDot, MindshareLegend, isMeasured } from "@/components/feed/mindshare-source";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VERTICALS,
  jitter,
  type Token,
  type Vertical,
} from "@/lib/mock-data";
import { useTokenIndex, type IndexedToken } from "@/lib/token-index";
import { Sparkline } from "./sparkline";
import { Avatar } from "./avatar";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

const TIER_STYLES: Record<Token["tier"], string> = {
  "Top 10": "text-signal border-signal/40",
  "Top 100": "text-pulse border-pulse/40",
  Emerging: "text-[#F5F4F0] border-white/20",
  New: "text-[#6B6B6B] border-white/10",
};

export function SignalBoard() {
  const { tokens: indexed } = useTokenIndex();
  const [tokens, setTokens] = useState<IndexedToken[]>(indexed);
  const [vertical, setVertical] = useState<Vertical>("All");

  // Re-seed whenever the on-chain snapshot upgrades entries. Same shape as
  // TrendingWall: the tick timer below owns `tokens` between snapshots, so
  // this is a prop-driven reset of drifting local state rather than something
  // derivable, and it belongs in render rather than an effect.
  const [prevIndexed, setPrevIndexed] = useState(indexed);
  if (indexed !== prevIndexed) {
    setPrevIndexed(indexed);
    setTokens(indexed);
  }

  // "Live" feel — client-only so server and first client render match.
  useEffect(() => {
    const id = setInterval(() => {
      setTokens((prev) => {
        const next = prev
          .map((t) => (isMeasured(t.mindshareSource) ? t : jitter(t)))
          .sort((a, b) => b.mindshare - a.mindshare);
        return next.map((t, i) => ({ ...t, rank: i + 1 }));
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(
    () => (vertical === "All" ? tokens : tokens.filter((t) => t.vertical === vertical)),
    [tokens, vertical],
  );

  return (
    <section id="feed" className="mx-auto mt-10 w-full max-w-5xl scroll-mt-16 px-5">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {VERTICALS.map((v) => (
          <button
            key={v}
            onClick={() => setVertical(v)}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide transition-colors",
              v === vertical
                ? "border-signal/60 bg-signal/10 text-signal"
                : "border-white/10 text-[#6B6B6B] hover:text-[#F5F4F0]",
            )}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-sm border border-white/[0.08] bg-[#1C1C1C]">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#2E2E2E] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Live Mindshare Feed
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/discover"
              className="font-mono text-[10px] tracking-[0.1em] text-[#6B6B6B] transition-colors hover:text-signal"
            >
              Browse by vertical →
            </Link>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-signal">
              <span className="af-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-signal" />
              LIVE
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[24px_1fr_64px_48px] items-center gap-2 border-b border-white/[0.06] px-4 py-2 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] sm:grid-cols-[28px_1fr_72px_72px_56px_64px] sm:px-5">
          <span>#</span>
          <span>Handle</span>
          <span className="text-right">Share</span>
          <span className="hidden text-right sm:block">Mkt Cap</span>
          <span className="text-right">24h</span>
          <span className="hidden text-right sm:block">Trend</span>
        </div>

        {rows.map((t) => {
          const up = t.delta24h >= 0;
          return (
            <Link
              key={t.handle}
              href={`/token/${t.handle}`}
              className="grid grid-cols-[24px_1fr_64px_48px] items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px] transition-colors last:border-b-0 hover:bg-white/[0.03] sm:grid-cols-[28px_1fr_72px_72px_56px_64px] sm:px-5"
            >
              <span className="font-mono text-[11px] text-[#6B6B6B]">
                {String(t.rank).padStart(2, "0")}
              </span>

              <div className="flex min-w-0 items-center gap-2">
                <Avatar handle={t.handle} image={t.image} className="h-5 w-5" />
                <span className="truncate font-semibold">@{t.handle}</span>
                {t.verified && (
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-signal" aria-label="verified" />
                )}
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px]",
                    TIER_STYLES[t.tier],
                  )}
                >
                  {t.vertical}
                </span>
              </div>

              <span className="flex items-center justify-end gap-1.5 font-mono text-[12px]">
                <MindshareDot source={t.mindshareSource} />
                {t.mindshare.toFixed(2)}%
              </span>
              <span className="hidden text-right font-mono text-[12px] text-[#6B6B6B] sm:block">
                {usd(t.marketCap)}
              </span>
              <span
                className={cn(
                  "text-right font-mono text-[11px] font-bold",
                  up ? "text-signal" : "text-noise",
                )}
              >
                {up ? "+" : ""}
                {t.delta24h.toFixed(0)}%
              </span>
              <div className="hidden justify-end sm:flex">
                <Sparkline points={t.spark} up={up} />
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-[#6B6B6B]">
        <span>Prices are hypothetical until a curve is launched on-chain.</span>
        <MindshareLegend />
      </p>
    </section>
  );
}
