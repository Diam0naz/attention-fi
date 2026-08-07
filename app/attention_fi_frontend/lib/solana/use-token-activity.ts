"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana/program";
import { fetchHolders, type HolderRow } from "@/lib/solana/holders";

export interface TradeRow {
  signature: string;
  side: "buy" | "sell";
  sol: number;
  tokens: number;
  wallet: string | null;
  blockTime: number | null;
  /** True when it executed against the AMM pool rather than the curve. */
  onPool: boolean;
}

export interface TokenActivity {
  trades: TradeRow[];
  /**
   * Why the trade list is empty, when it is. An indexer is optional, and
   * "nobody has traded this" and "we aren't indexing" are different facts —
   * showing the same blank panel for both is how a deployment problem gets
   * read as a quiet market.
   */
  tradesUnavailable: boolean;
  loaded: boolean;
}

const NO_TRADES: TokenActivity = { trades: [], tradesUnavailable: false, loaded: false };

/**
 * Real trades for a token, from the indexer.
 *
 * Both venues count: `trade` rows come from the bonding curve and `swap` rows
 * from the AMM pool. A graduated token whose history stopped at graduation
 * would look abandoned at exactly the moment it got most liquid.
 */
export function useTokenTrades(mint: string | null, limit = 30): TokenActivity {
  // Keyed by mint and compared during render, so navigating between tokens
  // can't show the previous one's trades under the new one's name.
  const [snapshot, setSnapshot] = useState<{ key: string; state: TokenActivity } | null>(null);

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `/api/activity?mint=${mint}&kinds=trade,swap&limit=${limit}`,
        );
        if (!res.ok) throw new Error("activity unavailable");
        const body = (await res.json()) as {
          events?: {
            signature: string;
            kind: string;
            isBuy: boolean | null;
            sol: number | null;
            tokens: number | null;
            actor: string | null;
            blockTime: number | null;
          }[];
          reason?: string;
        };
        if (cancelled) return;

        const trades: TradeRow[] = (body.events ?? []).map((e) => ({
          signature: e.signature,
          side: e.isBuy ? "buy" : "sell",
          sol: e.sol ?? 0,
          tokens: e.tokens ?? 0,
          wallet: e.actor,
          blockTime: e.blockTime,
          onPool: e.kind === "swap",
        }));
        setSnapshot({
          key: mint,
          state: { trades, tradesUnavailable: body.reason === "no-db", loaded: true },
        });
      } catch {
        if (!cancelled) {
          setSnapshot({
            key: mint,
            state: { trades: [], tradesUnavailable: true, loaded: true },
          });
        }
      }
    };

    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mint, limit]);

  // No mint is a settled answer, not a pending one.
  if (!mint) return { ...NO_TRADES, loaded: true };
  return snapshot && snapshot.key === mint ? snapshot.state : NO_TRADES;
}

export interface HoldersState {
  holders: HolderRow[];
  count: number;
  truncated: boolean;
  loaded: boolean;
}

const NO_HOLDERS: HoldersState = { holders: [], count: 0, truncated: false, loaded: false };

/** Holder distribution for a token, read straight from its token accounts. */
export function useTokenHolders(
  mint: string | null,
  opts: { creator?: string | null; viewer?: string | null } = {},
): HoldersState {
  const [snapshot, setSnapshot] = useState<{ key: string; state: HoldersState } | null>(null);
  const { creator, viewer } = opts;

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchHolders(getConnection(), new PublicKey(mint), {
          creator,
          viewer,
        });
        if (!cancelled) setSnapshot({ key: mint, state: { ...result, loaded: true } });
      } catch {
        if (!cancelled) {
          setSnapshot({
            key: mint,
            state: { holders: [], count: 0, truncated: false, loaded: true },
          });
        }
      }
    };

    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mint, creator, viewer]);

  if (!mint) return { ...NO_HOLDERS, loaded: true };
  return snapshot && snapshot.key === mint ? snapshot.state : NO_HOLDERS;
}
