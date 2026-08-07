"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { type TokenDetail } from "@/lib/mock-data";
import type { Mention } from "@/lib/mentions";
import { handleToMint } from "@/lib/solana/registry";
import { useVenue } from "@/lib/solana/use-venue";
import { useTokenHolders } from "@/lib/solana/use-token-activity";
import { graduationOutlook } from "@/lib/solana/venue";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function ago(ts: string | null): string {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(ts)) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

interface MentionsState {
  mentions: Mention[];
  configured: boolean;
  unavailable: boolean;
  loaded: boolean;
}

/**
 * Design 1b — "Mindshare-First": leads with social proof and the graduation
 * gauge instead of the data-dense chart terminal (1a).
 */
export function MindshareView({ token }: { token: TokenDetail }) {
  const mintKey = handleToMint(token.handle);
  const mint = mintKey?.toBase58() ?? "";
  const { venue, feeBps, graduationLamports } = useVenue(mintKey);
  const { holders, loaded: holdersLoaded } = useTokenHolders(mint, {
    creator: venue?.curve?.creator ?? null,
  });

  const [mentionsState, setMentionsState] = useState<MentionsState>({
    mentions: [],
    configured: true,
    unavailable: false,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mentions?handle=${encodeURIComponent(token.handle)}`);
        const body = (await res.json()) as {
          mentions?: Mention[];
          configured?: boolean;
          unavailable?: boolean;
        };
        if (!cancelled) {
          setMentionsState({
            mentions: body.mentions ?? [],
            configured: body.configured !== false,
            unavailable: body.unavailable === true,
            loaded: true,
          });
        }
      } catch {
        if (!cancelled) {
          setMentionsState({ mentions: [], configured: true, unavailable: true, loaded: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token.handle]);

  // Graduation from the curve's own reserves where there is one; the catalog
  // figure is the fallback for tokens that aren't on-chain.
  const outlook =
    venue && graduationLamports > 0n
      ? graduationOutlook(venue, 0, graduationLamports, feeBps)
      : null;
  const gradPct = outlook
    ? Math.round(outlook.progress * 100)
    : Math.min(100, Math.round((token.raisedUsd / token.targetUsd) * 100));

  // Distribution from the real holder table. The venue's own inventory is
  // separated out rather than folded into "others": tokens still sitting in the
  // curve or the pool aren't held by anyone, and counting them as dispersed
  // makes concentration look better than it is.
  const venuePct = holders
    .filter((h) => h.tag === "curve" || h.tag === "pool")
    .reduce((a, h) => a + h.pct, 0);
  const creatorPct = holders.find((h) => h.tag === "creator")?.pct ?? 0;
  const topPct = holders
    .filter((h) => h.tag !== "curve" && h.tag !== "pool" && h.tag !== "creator" && h.tag !== "others")
    .reduce((a, h) => a + h.pct, 0);
  const othersPct = Math.max(0, 100 - venuePct - creatorPct - topPct);
  const dist = [
    { label: venue?.kind === "pool" ? "pool" : "curve", pct: venuePct, color: "bg-pulse" },
    { label: "creator", pct: creatorPct, color: "bg-signal" },
    { label: "top holders", pct: topPct, color: "bg-[#5b8fff]" },
    { label: "others", pct: othersPct, color: "bg-white/25" },
  ].filter((d) => d.pct > 0.05);

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

      {/* social proof — real posts, or an honest account of why there are none */}
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
          Recent mentions feeding the score
        </div>
        {!mentionsState.loaded ? (
          <p className="mt-3 font-mono text-[11px] text-[#6B6B6B]">Reading the conversation…</p>
        ) : mentionsState.mentions.length === 0 ? (
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-[#6B6B6B]">
            {!mentionsState.configured
              ? "No social source is configured for this deployment, so the conversation can't be shown here. The mindshare number above comes from the deterministic engine."
              : mentionsState.unavailable
                ? "The social feed didn't respond. This says nothing about how much @" +
                  token.handle +
                  " is being talked about — only that we couldn't read it just now."
                : `No recent posts mention @${token.handle}.`}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {mentionsState.mentions.map((m) => (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="block border-l-2 border-signal/40 pl-3 transition-colors hover:border-signal"
              >
                <p className="line-clamp-4 text-[13px] leading-relaxed text-[#d7dde3]">{m.text}</p>
                <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
                  @{m.author}
                  {m.timestamp && ` · ${ago(m.timestamp)}`}
                  {/* Real engagement counts, not invented impressions — these
                      are numbers the source actually reports. */}
                  {m.likes > 0 && ` · ${m.likes} likes`}
                  {m.recasts > 0 && ` · ${m.recasts} recasts`}
                </div>
              </a>
            ))}
          </div>
        )}
        <div className="mt-4 border-t border-white/[0.06] pt-3 font-mono text-[9px] text-[#4b5563]">
          {mentionsState.mentions.length > 0
            ? "live from Farcaster · the same casts the mindshare sweep counts"
            : "mindshare source: see /api/mindshare"}
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
            <div className="font-mono text-[16px] font-bold">
              {outlook ? `${outlook.reservesSol.toFixed(1)} SOL` : usd(token.raisedUsd)}
            </div>
            <div className="font-mono text-[10px] text-[#6B6B6B]">
              {outlook ? `/ ${outlook.thresholdSol.toFixed(0)} SOL raised` : `/ ${usd(token.targetUsd)} mkt cap`}
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${gradPct}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-[#6B6B6B]">
          {venue?.kind === "pool"
            ? "graduated — trading on its native AMM pool"
            : venue?.kind === "stranded"
              ? "threshold reached; awaiting migration to the AMM"
              : "graduates to a native AMM at threshold"}
        </div>
      </div>

      {/* holder distribution */}
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">Holder distribution</div>
        {!holdersLoaded ? (
          <p className="mt-3 font-mono text-[11px] text-[#6B6B6B]">Reading token accounts…</p>
        ) : dist.length === 0 ? (
          <p className="mt-3 font-mono text-[11px] text-[#6B6B6B]">
            Nobody holds this token yet.
          </p>
        ) : (
          <>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
              {dist.map((d) => (
                <div key={d.label} className={cn("h-full", d.color)} style={{ width: `${d.pct}%` }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[11px]">
              {dist.map((d) => (
                <span key={d.label} className="inline-flex items-center gap-1.5 text-[#9aa4af]">
                  <span className={cn("h-2 w-2 rounded-full", d.color)} />
                  {d.label} <span className="text-[#F5F4F0]">{d.pct.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
