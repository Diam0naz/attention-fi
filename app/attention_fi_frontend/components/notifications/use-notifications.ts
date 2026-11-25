"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { getConnection } from "@/lib/solana/program";
import { fetchWalletPositions, type WalletPosition } from "@/lib/solana/positions";
import {
  fetchNftOutcomes,
  fetchPerkGrant,
  type NftOutcome,
} from "@/lib/solana/nft-data";
import { SCOPE } from "@/lib/scope";
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

/**
 * Tell a holder when a token they own changes venue.
 *
 * Graduation is the one event that happens *to* a holder rather than because
 * of them, and it changes what they can do: the bonding curve stops accepting
 * trades the moment the threshold is crossed. Nothing in the app said so, so
 * the first anyone learned of it was a sell that wouldn't go through.
 *
 * Two states, and the difference is the whole point:
 *
 *   stranded — complete, no pool. The position cannot be sold at any price.
 *              Actionable, because the migration is permissionless: the holder
 *              reading this can fix it themselves in one transaction. This is
 *              the notification that would have surfaced 95 SOL sitting in a
 *              curve nobody could trade against.
 *   pool     — migrated. Trading has resumed somewhere new, at a price the
 *              curve no longer sets.
 *
 * Read off held positions rather than the indexer: the indexer is optional
 * (several deployments run without one), and a graduation notice that silently
 * depends on it would be missing exactly where it matters.
 */
function graduationNotice(p: WalletPosition, seen: Set<string>): AppNotification | null {
  if (p.venue === "curve") return null;
  const label = p.meta ? `$${p.meta.symbol}` : short(p.mint);

  if (p.venue === "stranded") {
    const id = `stranded:${p.mint}`;
    return {
      id,
      type: "graduation",
      text: `${label} hit its graduation threshold, so its bonding curve has stopped trading — and its AMM pool hasn't been created yet, so your position can't be sold until it is. Anyone can run the migration, including you.`,
      time: "action needed",
      read: seen.has(id),
      href: p.meta ? `/token/${p.meta.handle}` : undefined,
      action: "Run migration",
    };
  }

  const id = `graduated:${p.mint}`;
  return {
    id,
    type: "graduation",
    text: `${label} graduated — it now trades on its own AMM pool instead of the bonding curve. Your position moved with it.`,
    time: "graduated",
    read: seen.has(id),
    href: p.meta ? `/token/${p.meta.handle}` : undefined,
    action: "View market",
  };
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

/** Cache key for the bell's contents. Exported so writers can invalidate it. */
export const notificationsKey = (address: string | null | undefined) =>
  ["notifications", address ?? null] as const;

export function useNotifications(): Notifications {
  const { address } = useWallet();
  const program = useReadonlyProgram();
  const queryClient = useQueryClient();
  const [seen, setSeen] = useState<Set<string>>(() => new Set());

  const query = useQuery({
    queryKey: notificationsKey(address),
    queryFn: async () => {
      const owner = new PublicKey(address!);
      // Independent sources: the PDAs say what happened, the events say for how
      // much, and the grant is a separate entitlement. Losing one must not cost
      // the others, so each settles on its own.
      // NFT sales, skins and perk grants are outside the current scope
      // (lib/scope.ts): they aren't fetched, so the bell never links to them.
      const [outcomes, facts, grant, signatureUnlocked, positions] = await Promise.all([
        SCOPE.nft
          ? fetchNftOutcomes(program, owner).catch(() => [] as NftOutcome[])
          : Promise.resolve([] as NftOutcome[]),
        SCOPE.nft ? fetchSaleFacts() : Promise.resolve(new Map<string, SaleFact>()),
        SCOPE.perks ? fetchPerkGrant(program, owner).catch(() => null) : Promise.resolve(null),
        SCOPE.nft ? fetchSignatureUnlocked(address!) : Promise.resolve(false),
        fetchWalletPositions(program, getConnection(), owner)
          .then((r) => r.positions)
          .catch(() => [] as WalletPosition[]),
      ]);
      return { outcomes, facts, grant, signatureUnlocked, positions };
    },
    enabled: Boolean(address),
    // A failed poll keeps the bell as it was rather than emptying it, which
    // would read as "those things never happened".
    placeholderData: (prev) => prev,
    refetchInterval: POLL_MS,
  });

  // Read state is per-wallet and lives in the browser, so it's loaded lazily
  // rather than as part of the query.
  const storedSeen = address ? readSeen(address) : new Set<string>();
  const effectiveSeen = seen.size > 0 ? seen : storedSeen;

  const outcomes = query.data?.outcomes ?? [];
  const saleFacts = query.data?.facts ?? new Map<string, SaleFact>();
  const grant = query.data?.grant ?? null;
  const signatureUnlocked = query.data?.signatureUnlocked ?? false;
  const positions = query.data?.positions ?? [];
  const loading = query.isPending;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: notificationsKey(address) });
  }, [queryClient, address]);

  const items = outcomes.map((o) => toNotification(o, effectiveSeen, saleFacts.get(o.asset)));

  // Venue changes on held tokens, newest concern first. Stranded outranks
  // graduated because only one of the two asks the reader to do something —
  // and until they do, they can't sell.
  const venueNotices = positions
    .map((p) => graduationNotice(p, effectiveSeen))
    .filter((n): n is AppNotification => n !== null)
    .sort((a, b) => Number(b.id.startsWith("stranded:")) - Number(a.id.startsWith("stranded:")));
  items.unshift(...venueNotices);

  if (signatureUnlocked) {
    // Stable id, so dismissing it keeps it dismissed rather than resurfacing
    // on every poll.
    const id = `signature-unlocked:${address ?? ""}`;
    items.unshift({
      id,
      type: "graduation",
      text: "You own every skin — Signature is unlocked. Put your own artwork on any NFT you hold.",
      time: "unlocked",
      read: effectiveSeen.has(id),
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
      read: effectiveSeen.has(id),
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
        const next = new Set(prev.size > 0 ? prev : readSeen(address));
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
