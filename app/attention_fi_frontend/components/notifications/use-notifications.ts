"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import {
  fetchNftOutcomes,
  fetchPerkGrant,
  type NftOutcome,
  type PerkGrantData,
} from "@/lib/solana/nft-data";
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

/**
 * What a listing actually fetched, from the indexed `NftAuctionEvent`.
 *
 * The auction PDA records the schedule, not the outcome — `buy_nft` clears the
 * account's usefulness for this — so the price paid and the moment of sale only
 * exist in the event. Sales from before that event shipped have no row here,
 * which is why the fallback below has to stay.
 */
interface SaleFact {
  priceSol: number;
  blockTime: number | null;
}

/**
 * Whether Signature has unlocked for this wallet.
 *
 * Worth a notification where a purchase isn't: buying a skin is something you
 * just did and watched happen, but crossing the last one into Signature is a
 * threshold you'd otherwise have to notice yourself.
 */
async function fetchSignatureUnlocked(subject: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/verification/skin?subject=${subject}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { customUnlocked?: boolean };
    return body.customUnlocked === true;
  } catch {
    return false;
  }
}

async function fetchSaleFacts(): Promise<Map<string, SaleFact>> {
  const out = new Map<string, SaleFact>();
  try {
    const res = await fetch("/api/activity?kinds=nft_sale&limit=200");
    if (!res.ok) return out;
    const body = (await res.json()) as {
      events?: { mint: string | null; sol: number | null; blockTime: number | null }[];
    };
    for (const e of body.events ?? []) {
      // The indexer stores a 1-of-1's asset in the mint column.
      if (!e.mint || out.has(e.mint)) continue;
      out.set(e.mint, { priceSol: e.sol ?? 0, blockTime: e.blockTime });
    }
  } catch {
    // No indexer configured / offline — fall back to the PDA-derived text.
  }
  return out;
}

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

function toNotification(
  o: NftOutcome,
  seen: Set<string>,
  fact: SaleFact | undefined,
): AppNotification {
  const id = `${o.outcome}:${o.asset}`;
  const to = o.buyer ? ` to ${short(o.buyer)}` : "";

  let text: string;
  if (o.outcome !== "sold") {
    text = `${o.name} ended unsold and is back in your wallet`;
  } else if (fact) {
    text = `${o.name} sold${to} for ${fact.priceSol.toFixed(3)} SOL`;
  } else {
    // No event for this sale, so the price genuinely isn't recorded anywhere.
    // Quoting the floor as though it were the sale price reads as a real
    // number and is usually far too low — a descending auction almost always
    // clears above it.
    text = `${o.name} sold${to} — price not recorded`;
  }

  return {
    id,
    // Reuses the panel's existing visual vocabulary: a sale is the good
    // outcome, a reclaim is informational.
    type: o.outcome === "sold" ? "graduation" : "mention",
    text,
    // The event carries when it actually sold; the PDA only knows when the
    // window would have closed.
    time: ago(fact?.blockTime ?? o.endedAt),
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
  const [saleFacts, setSaleFacts] = useState<Map<string, SaleFact>>(new Map());
  // An unclaimed grant is the one notification that's actionable: the perk
  // doesn't exist until the recipient mints it, so silence here means a
  // granted discount is simply never collected.
  const [grant, setGrant] = useState<PerkGrantData | null>(null);
  const [signatureUnlocked, setSignatureUnlocked] = useState(false);
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
        // Independent sources: the PDAs say what happened, the events say for
        // how much. Losing the second must not cost the first.
        const [list, facts, pending, unlocked] = await Promise.all([
          fetchNftOutcomes(program, new PublicKey(address)),
          fetchSaleFacts(),
          fetchPerkGrant(program, new PublicKey(address)),
          fetchSignatureUnlocked(address),
        ]);
        if (!cancelled) {
          setOutcomes(list);
          setSaleFacts(facts);
          setGrant(pending);
          setSignatureUnlocked(unlocked);
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

  const items = outcomes.map((o) => toNotification(o, seen, saleFacts.get(o.asset)));

  if (signatureUnlocked) {
    // Stable id, so dismissing it keeps it dismissed rather than resurfacing
    // on every poll.
    const id = `signature-unlocked:${address ?? ""}`;
    items.unshift({
      id,
      type: "graduation",
      text: "You own every skin — Signature is unlocked. Put your own artwork on any NFT you hold.",
      time: "unlocked",
      read: seen.has(id),
      href: "/nft/verification",
      action: "Set your artwork",
    });
  }

  // Pinned first: it's the only item that needs the reader to do something,
  // and it disappears by itself once claimed (the grant account closes).
  if (grant) {
    const id = `grant:${grant.recipient}:${grant.level}`;
    items.unshift({
      id,
      type: "referral",
      text: `You've been granted a Level ${grant.level} perk — claim it to mint your NFT and start paying ${grant.level}% less on every trade.`,
      time: "pending",
      read: seen.has(id),
      href: "/nft/perk",
      action: "Claim your perk",
    });
  }

  const markAllRead = useCallback(() => {
    if (!address) return;
    const all = new Set(items.map((i) => i.id));
    setSeen(all);
    writeSeen(address, all);
  }, [address, items]);

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
