"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { jitter, tokenImage, type Token } from "@/lib/mock-data";
import { useTokenIndex } from "@/lib/token-index";

const byMindshare = (a: Token, b: Token) => b.mindshare - a.mindshare;

/** Live "video wall": a large featured tile + four interlocking tiles, ordered
 *  by mindshare, with ticking numbers, pulse dots and a light sheen. */
export function TrendingWall() {
  const { tokens: indexed } = useTokenIndex();
  const [tokens, setTokens] = useState<Token[]>(() => [...indexed].sort(byMindshare).slice(0, 5));

  // re-seed whenever the on-chain snapshot upgrades entries
  useEffect(() => {
    setTokens([...indexed].sort(byMindshare).slice(0, 5));
  }, [indexed]);

  // "Live" tick — jitter mindshare and re-rank every couple seconds (client-only
  // so SSR and first paint stay deterministic).
  useEffect(() => {
    const id = setInterval(() => {
      setTokens((prev) => prev.map(jitter).sort(byMindshare));
    }, 2600);
    return () => clearInterval(id);
  }, []);

  const [featured, ...rest] = tokens;
  if (!featured) return null;
  const max = featured.mindshare || 1;

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl px-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold">🔥 Trending</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-signal">
            <span className="af-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-signal" />
            LIVE
          </span>
        </div>
        <Link href="/discover" className="font-mono text-[10px] text-[#6B6B6B] transition-colors hover:text-signal">
          See all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 auto-rows-[124px] sm:grid-cols-4">
        <FeaturedTile token={featured} max={max} />
        {rest.map((t, i) => (
          <SmallTile key={t.handle} token={t} rank={i + 2} max={max} />
        ))}
      </div>
    </section>
  );
}

function Bg({ handle }: { handle: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tokenImage(handle)}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
      <div className="af-nft-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3" />
    </>
  );
}

function Delta({ v, className }: { v: number; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums", v >= 0 ? "text-signal" : "text-noise", className)}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

function FeaturedTile({ token, max }: { token: Token; max: number }) {
  return (
    <Link
      href={`/token/${token.handle}`}
      className="group relative col-span-2 row-span-2 overflow-hidden rounded-lg border border-white/10 bg-[#0f1620] transition-colors hover:border-signal/40"
    >
      <Bg handle={token.handle} />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-signal px-2 py-0.5 font-mono text-[9px] font-bold tracking-wide text-[#0A0A0A]">
            TRENDING #1
          </span>
          <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[9px] text-[#9aa4af]">
            {token.vertical}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[19px] font-bold">@{token.handle}</span>
            {token.verified && <BadgeCheck className="h-4 w-4 text-signal" />}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[30px] font-bold tabular-nums text-signal">
              {token.mindshare.toFixed(2)}%
            </span>
            <Delta v={token.delta24h} className="text-[13px]" />
            <span className="text-[10px] text-[#9aa4af]">mindshare</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-signal/50 to-signal transition-all duration-700"
              style={{ width: `${Math.min(100, (token.mindshare / max) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function SmallTile({ token, rank, max }: { token: Token; rank: number; max: number }) {
  return (
    <Link
      href={`/token/${token.handle}`}
      className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#0f1620] transition-colors hover:border-signal/40"
    >
      <Bg handle={token.handle} />
      <div className="relative flex h-full flex-col justify-between p-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[#9aa4af]">#{rank}</span>
          <span className="af-pulse-dot h-1.5 w-1.5 rounded-full bg-signal" />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <span className="truncate text-[12px] font-bold">@{token.handle}</span>
            {token.verified && <BadgeCheck className="h-3 w-3 shrink-0 text-signal" />}
          </div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="font-mono text-[15px] font-bold tabular-nums text-signal">
              {token.mindshare.toFixed(2)}%
            </span>
            <Delta v={token.delta24h} className="text-[10px]" />
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-signal/70 transition-all duration-700"
              style={{ width: `${Math.min(100, (token.mindshare / max) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
