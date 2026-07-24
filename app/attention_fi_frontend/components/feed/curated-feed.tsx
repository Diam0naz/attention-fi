"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERTICALS, verticalSlug, type Token, type Vertical } from "@/lib/mock-data";
import { useTokenIndex } from "@/lib/token-index";
import { Avatar } from "@/components/feed/avatar";
import { Footer } from "@/components/feed/footer";

function blurb(t: Token): string {
  const dir = t.delta24h >= 8 ? "Breaking out" : t.delta24h >= 0 ? "Climbing" : "Cooling off";
  return `${dir} in ${t.vertical} · rank #${t.rank}`;
}

/** Mini gradient bar standing in for a sparkline (share of the shelf-max mindshare). */
function MiniBar({ pct, up }: { pct: number; up: boolean }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={cn("h-full rounded-full", up ? "bg-gradient-to-r from-signal/40 to-signal" : "bg-gradient-to-r from-noise/40 to-noise")}
        style={{ width: `${Math.max(8, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function TokenCard({ t, max }: { t: Token; max: number }) {
  return (
    <Link
      href={`/token/${t.handle}`}
      className="group flex w-[220px] shrink-0 flex-col rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 transition-colors hover:border-signal/30"
    >
      <div className="flex items-center gap-2">
        <Avatar handle={t.handle} image={t.image} className="h-7 w-7" />
        <span className="truncate text-[13px] font-bold">@{t.handle}</span>
        {t.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-signal" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[18px] font-bold text-signal">{t.mindshare.toFixed(2)}%</span>
        <span className={cn("font-mono text-[11px]", t.delta24h >= 0 ? "text-signal" : "text-noise")}>
          {t.delta24h >= 0 ? "+" : ""}
          {t.delta24h.toFixed(1)}%
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[#6B6B6B]">{blurb(t)}</p>
      <MiniBar pct={(t.mindshare / max) * 100} up={t.delta24h >= 0} />
    </Link>
  );
}

export function CuratedFeed() {
  const { tokens: indexed } = useTokenIndex();
  const [filter, setFilter] = useState<Vertical>("All");
  const [query, setQuery] = useState("");

  const editor = indexed[0]!; // rank 1 = editor's pick
  const q = query.trim().toLowerCase();

  // Tokens grouped per vertical (excluding the editor's pick), honoring search.
  const shelves = useMemo(() => {
    const verticals = VERTICALS.filter((v) => v !== "All" && (filter === "All" || filter === v));
    return verticals
      .map((v) => ({
        vertical: v,
        tokens: indexed.filter(
          (t) => t.vertical === v && t.handle !== editor.handle && (!q || t.handle.includes(q) || t.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.tokens.length > 0);
  }, [indexed, filter, q, editor.handle]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <h1 className="text-[20px] font-bold">Discover</h1>
        <p className="mt-1 text-[13px] text-[#6B6B6B]">Browse tradeable attention by vertical, curated by mindshare velocity.</p>

        {/* search + pill filters */}
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 rounded-sm border border-white/10 bg-[#12181f] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[#6B6B6B]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search handles, narratives…"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#4b5563]"
            />
          </label>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {VERTICALS.map((v) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors",
                  filter === v ? "border-signal bg-signal text-[#0A0A0A]" : "border-white/12 text-[#6B6B6B] hover:text-[#F5F4F0]",
                )}
              >
                {v === "All" ? "All" : v}
              </button>
            ))}
          </div>
        </div>

        {/* editor's pick */}
        <div className="mt-6 overflow-hidden rounded-sm border border-signal/30 bg-[linear-gradient(90deg,rgba(0,255,133,0.12),transparent)] p-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-signal">Editor&apos;s Pick · Today</div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar handle={editor.handle} image={editor.image} className="h-14 w-14 ring-2 ring-signal/30" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[18px] font-bold">@{editor.handle}</span>
                {editor.verified && <BadgeCheck className="h-4 w-4 text-signal" />}
                <span className="rounded-full border border-signal/40 px-2 py-0.5 font-mono text-[8px] font-bold text-signal">
                  {editor.tier.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[#9aa4af]">{blurb(editor)} — leading crypto-twitter mindshare today.</p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[26px] font-bold text-signal">{editor.mindshare.toFixed(2)}%</div>
              <div className="font-mono text-[9px] text-[#6B6B6B]">MINDSHARE</div>
            </div>
            <Link
              href={`/token/${editor.handle}`}
              className="rounded-sm bg-signal px-5 py-2.5 text-center font-mono text-[12px] font-bold text-[#0A0A0A]"
            >
              TRADE
            </Link>
          </div>
        </div>

        {/* per-vertical shelves */}
        {shelves.length === 0 ? (
          <p className="mt-10 text-center font-mono text-[12px] text-[#6B6B6B]">No tokens match — try another filter.</p>
        ) : (
          shelves.map((shelf) => {
            const max = Math.max(...shelf.tokens.map((t) => t.mindshare));
            return (
              <section key={shelf.vertical} className="mt-8">
                <div className="flex items-baseline justify-between">
                  <div>
                    <h2 className="text-[15px] font-bold">{shelf.vertical}</h2>
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">curated by mindshare velocity</span>
                  </div>
                  <Link
                    href={`/discover/${verticalSlug(shelf.vertical)}`}
                    className="font-mono text-[10px] text-signal hover:underline"
                  >
                    SEE ALL →
                  </Link>
                </div>
                <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-2">
                  {shelf.tokens.map((t) => (
                    <TokenCard key={t.handle} t={t} max={max} />
                  ))}
                  <Link
                    href="/launch"
                    className="flex w-[220px] shrink-0 flex-col items-center justify-center rounded-sm border border-dashed border-white/15 p-4 text-center text-[12px] text-[#6B6B6B] transition-colors hover:border-signal/40 hover:text-signal"
                  >
                    launch here →
                  </Link>
                </div>
              </section>
            );
          })
        )}
      </div>

      <Footer />
    </div>
  );
}
