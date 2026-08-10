"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { cn } from "@/lib/utils";
import { NftCardFace } from "@/components/nft/nft-card";
import { CollectionDeck, deckCard } from "@/components/nft/collection-deck";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import {
  collectionPrice,
  fetchCollectionAssets,
  type CollectionAuctionData,
  type OwnedAsset,
} from "@/lib/solana/nft-data";

const sol = (l: bigint) => (Number(l) / 1e9).toFixed(3);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * A collection for sale, shown as the deck it actually is.
 *
 * This used to be a flat row with a generic layers glyph and a piece count,
 * while the owner's shelf showed the same collection as fanned artwork. The
 * buyer — the one person who has to decide whether the set is worth 15 SOL —
 * got the version with no pictures in it. Now both screens render the same
 * object, and the contents are one tap away rather than invisible.
 *
 * Members load only when the deck is opened. A market page may carry a dozen
 * listings and each collection is a separate multi-account read, so fetching
 * them all upfront would make the page cost scale with inventory nobody has
 * looked at yet.
 */
export function CollectionMarketCard({
  listing,
  now,
  mine,
  promoted,
  onBuy,
  onDelist,
  onPromote,
}: {
  listing: CollectionAuctionData;
  now: number;
  mine: boolean;
  promoted?: boolean;
  onBuy: (c: CollectionAuctionData) => void;
  onDelist: (c: CollectionAuctionData) => void;
  onPromote?: (() => void) | undefined;
}) {
  const readProgram = useReadonlyProgram();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OwnedAsset[] | null>(null);

  useEffect(() => {
    if (!open || members !== null) return;
    let cancelled = false;
    void (async () => {
      const list = await fetchCollectionAssets(
        readProgram,
        new PublicKey(listing.collection),
      ).catch(() => []);
      if (!cancelled) setMembers(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, members, readProgram, listing.collection]);

  const price = collectionPrice(listing, now);
  const declining = listing.startPrice !== listing.floorPrice;
  const secondsLeft =
    listing.duration === 0 ? null : listing.startTime + listing.duration - Math.floor(now / 1000);

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex flex-wrap items-start gap-4">
        <CollectionDeck
          name={listing.name}
          size={listing.size}
          // Null until opened, which the deck renders as its loading state —
          // honest, since we genuinely don't know the contents yet.
          members={open ? members : null}
          open={open}
          onToggle={() => setOpen((o) => !o)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-bold">{listing.name}</span>
            {promoted && (
              <span className="shrink-0 rounded-sm border border-signal/40 bg-signal/[0.08] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-signal">
                PROMOTED
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
            {listing.size} {listing.size === 1 ? "piece" : "pieces"} ·{" "}
            {short(listing.collection)}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
            {listing.duration === 0
              ? "No deadline"
              : secondsLeft !== null && secondsLeft > 0
                ? `${Math.floor(secondsLeft / 3600)}h left`
                : "ending"}
            {declining ? " · price falling" : ""}
            {" · "}
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-signal transition-colors hover:underline"
            >
              {open ? "hide contents" : "see what's inside"}
            </button>
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono text-[10px] text-[#6B6B6B]">PRICE</div>
          <div className="font-mono text-[18px] font-bold tabular-nums text-signal">
            {sol(price)}
          </div>
        </div>

        {mine ? (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => onDelist(listing)}
              className="rounded-sm border border-noise/40 px-4 py-2 font-mono text-[11px] font-bold text-noise"
            >
              DELIST
            </button>
            {onPromote && (
              <button
                onClick={onPromote}
                className="rounded-sm border border-signal/40 px-4 py-1.5 font-mono text-[10px] font-bold text-signal transition-colors hover:bg-signal/10"
              >
                {promoted ? "EXTEND" : "PROMOTE"}
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => onBuy(listing)}
            className="rounded-sm bg-signal px-5 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A]"
          >
            BUY SET
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          {members === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: Math.min(4, listing.size || 3) }, (_, i) => (
                <div key={i} className="af-skeleton aspect-3/4 rounded-xl" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="font-mono text-[11px] text-[#6B6B6B]">
              This set is empty — buying it transfers authority over a collection with nothing
              in it.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {members.map((m) => (
                  <div key={m.asset} className="flex flex-col gap-1.5">
                    <NftCardFace
                      data={deckCard(m, { name: listing.name, size: listing.size })}
                    />
                    <span className="truncate text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
                      {m.name}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#4b5563]">
                Buying the set transfers the collection&apos;s update authority, and with it every
                piece above — no asset changes hands individually.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Page size for the market list. */
export const COLLECTIONS_PER_PAGE = 6;

/**
 * Pager for the collection market.
 *
 * Each card can expand into a multi-account read, so an unbounded list makes
 * the page cost grow with inventory rather than with what anyone is looking
 * at. A page also gives promoted placement something to be at the top *of* —
 * paid position means little on a list that never ends.
 */
export function MarketPager({
  page,
  pages,
  onPage,
  className,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  className?: string;
}) {
  if (pages <= 1) return null;
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <button
        onClick={() => onPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className="rounded-sm border border-white/10 px-3 py-1.5 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:border-signal/40 hover:text-signal disabled:cursor-not-allowed disabled:opacity-30"
      >
        ← PREV
      </button>
      <span className="font-mono text-[10px] text-[#6B6B6B]">
        {page + 1} / {pages}
      </span>
      <button
        onClick={() => onPage(Math.min(pages - 1, page + 1))}
        disabled={page >= pages - 1}
        className="rounded-sm border border-white/10 px-3 py-1.5 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:border-signal/40 hover:text-signal disabled:cursor-not-allowed disabled:opacity-30"
      >
        NEXT →
      </button>
    </div>
  );
}
