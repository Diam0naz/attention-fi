"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchNftOutcomes, type NftOutcome } from "@/lib/solana/nft-data";
import type { AppNotification } from "@/components/notifications/notifications-panel";

/**
 * Things that happened to the connected wallet while it wasn't looking.
 *
 * Driven by the wallet's own auction PDAs rather than the activity feed: the
 * indexer records a sale's `actor` as the buyer, so a lister filtering by
 * actor would never find their own sales. The PDAs know who listed what.
 *
 * Read state is local to the browser — there's no per-user server store, and
 * inventing one to remember a dismissed badge isn't worth a table.
 */

const READ_KEY = (owner: string) => `af.notifications.read.${owner}`;
const POLL_MS = 60_000;

function readSeen(owner: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_KEY(owner));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(owner: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(READ_KEY(owner), JSON.stringify([...ids]));
  } catch {
    // Private-mode storage failure just means the badge reappears next load.
  }
}

const sol = (lamports: bigint) => (Number(lamports) / 1_000_000_000).toFixed(3);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function ago(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function toNotification(o: NftOutcome, seen: Set<string>): AppNotification {
  const id = `${o.outcome}:${o.asset}`;
  return {
    id,
    // Reuses the panel's existing visual vocabulary: a sale is the good
    // outcome, a reclaim is informational.
    type: o.outcome === "sold" ? "graduation" : "mention",
    text:
      o.outcome === "sold"
        ? `${o.name} sold${o.buyer ? ` to ${short(o.buyer)}` : ""} — at least ${sol(o.floorPrice)} SOL`
        : `${o.name} ended unsold and is back in your wallet`,
    time: ago(o.endedAt),
    read: seen.has(id),
  };
}

export interface Notifications {
  items: AppNotification[];
  unread: number;
  markAllRead: () => void;
  /** Toggle a single item, so "seen" can be corrected as well as set. */
  toggleRead: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

export function useNotifications(): Notifications {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  const [outcomes, setOutcomes] = useState<NftOutcome[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(async () => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Clearing happens inside the async body, not in the effect body: a
      // synchronous setState here is what the cascading-render lint catches.
      if (!address) {
        if (!cancelled) setOutcomes([]);
        return;
      }
      setLoading(true);
      try {
        const list = await fetchNftOutcomes(program, new PublicKey(address));
        if (!cancelled) {
          setOutcomes(list);
          setSeen(readSeen(address));
        }
      } catch {
        // A failed read leaves the last known set rather than clearing the
        // bell, which would look like the events never happened.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const id = setInterval(() => setNonce((n) => n + 1), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, program, nonce]);

  const items = outcomes.map((o) => toNotification(o, seen));

  const markAllRead = useCallback(() => {
    if (!address) return;
    const all = new Set(outcomes.map((o) => `${o.outcome}:${o.asset}`));
    setSeen(all);
    writeSeen(address, all);
  }, [address, outcomes]);

  const toggleRead = useCallback(
    (id: string) => {
      if (!address) return;
      setSeen((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeSeen(address, next);
        return next;
      });
    },
    [address],
  );

  return {
    items,
    unread: items.filter((i) => !i.read).length,
    markAllRead,
    toggleRead,
    refresh,
    loading,
  };
}
