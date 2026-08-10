"use client";

import { Plus } from "lucide-react";
import { NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { artworkUrl } from "@/lib/nft-artwork";
import type { OwnedAsset } from "@/lib/solana/nft-data";

/**
 * A collection rendered as a deck of cards.
 *
 * Extracted so the owner's shelf and the market listing show the *same* object.
 * A set for sale used to render as a flat row with a layers glyph while the
 * owner saw fanned artwork, which made the two screens look like two different
 * kinds of thing — and the buyer, who is the one deciding, got the version with
 * no pictures in it.
 *
 * Closed it sits as a squared-up deck; open it fans from a shared bottom
 * origin, like a hand. Both are pure transforms so the animation stays on the
 * compositor — see `.af-pack-card` in globals.css.
 */
export function CollectionDeck({
  name,
  size,
  members,
  open,
  onToggle,
  emptyAction,
  className,
}: {
  name: string;
  size: number;
  /** Null while loading — deliberately distinct from an empty collection. */
  members: OwnedAsset[] | null;
  open: boolean;
  onToggle: () => void;
  /** Owner-side affordance for an empty pack. Buyers pass nothing. */
  emptyAction?: { label: string; onClick: () => void };
  className?: string;
}) {
  const loading = members === null;
  const cover = (members ?? []).slice(0, 3);
  const isEmpty = members !== null && members.length === 0;

  return (
    <button
      onClick={() => (isEmpty && emptyAction ? emptyAction.onClick() : onToggle())}
      disabled={loading || (isEmpty && !emptyAction)}
      aria-busy={loading}
      aria-expanded={isEmpty ? undefined : open}
      aria-label={
        loading
          ? `Reading ${name}`
          : isEmpty && emptyAction
            ? `${emptyAction.label} ${name}`
            : `${open ? "Hide" : "Show"} ${name} contents`
      }
      className={`group relative h-24 w-[72px] shrink-0 ${className ?? ""}`}
    >
      {loading ? (
        // A loading pack must not look like an empty one, or it offers an
        // action for a collection that may be full and the label changes under
        // the cursor when the read lands.
        <>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="af-skeleton absolute inset-0 rounded-xl border border-white/[0.06]"
              style={{
                transform: `translate3d(${i * 3}px, ${i * -2}px, 0) rotate(${(i - 1) * 2.5}deg)`,
                zIndex: 3 - i,
                animationDelay: `${i * 140}ms`,
              }}
            />
          ))}
        </>
      ) : cover.length === 0 ? (
        <div className="af-pack-empty flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/12 group-hover:border-signal/40">
          {emptyAction ? (
            <>
              <Plus className="h-4 w-4 text-[#4b5563] transition-colors group-hover:text-signal" />
              <span className="font-mono text-[8px] tracking-[0.12em] text-[#4b5563] transition-colors group-hover:text-signal">
                ADD
              </span>
            </>
          ) : (
            <span className="font-mono text-[8px] tracking-[0.12em] text-[#4b5563]">EMPTY</span>
          )}
        </div>
      ) : (
        cover.map((m, i) => {
          const t = open
            ? `translate3d(${(i - 1) * 13}px, ${i === 1 ? -4 : 0}px, 0) rotate(${(i - 1) * 11}deg)`
            : `translate3d(${i * 3}px, ${i * -2}px, 0) rotate(${(i - 1) * 2.5}deg)`;
          return (
            <div
              key={m.asset}
              className="af-pack-card absolute inset-0 origin-bottom rounded-xl"
              style={{ transform: t, zIndex: cover.length - i }}
            >
              <NftCardFace data={deckCard(m, { name, size })} />
            </div>
          );
        })
      )}

      {/* The count rides on the artwork rather than only in the text column, so
          the pack carries its own label at a glance. */}
      {size > 0 && (
        <span className="pointer-events-none absolute -bottom-1 -right-1 z-10 rounded-full border border-white/15 bg-[#0A0A0A] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#F5F4F0]">
          {size}
        </span>
      )}
    </button>
  );
}

/** An owned asset as a card face. */
export function deckCard(
  a: OwnedAsset,
  collection?: { name: string; size: number },
): NftCardData {
  // artworkUrl, not `a.uri`: an asset minted without its own picture points at
  // the metadata document, which renders as nothing in an <img>.
  return {
    kind: "custom",
    name: a.name,
    image: artworkUrl(a.uri),
    ...(collection ? { collection } : {}),
  };
}
