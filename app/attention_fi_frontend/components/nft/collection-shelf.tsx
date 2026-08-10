"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { ChevronDown, Loader2, PackageOpen, Plus, Tag, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { CollectionDeck } from "@/components/nft/collection-deck";
import { artworkUrl } from "@/lib/nft-artwork";
import { Notice } from "@/components/ui/notice";
import { ListingFields, listingTerms, type ListingMode } from "@/components/nft/listing-form";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import {
  fetchCollectionAssets,
  type CollectionAuctionData,
  type CollectionData,
  type OwnedAsset,
} from "@/lib/solana/nft-data";

/**
 * A collection, shown as the thing it is rather than as a row in a table.
 *
 * Collections were listed as a name and a count, which told a holder nothing
 * about what was in one — and there was no way to put anything in it after
 * mint, even though `add_to_collection` has been on-chain the whole time.
 * Membership was a mint-time decision only because nothing surfaced the
 * instruction that undoes it.
 *
 * The cover is the first few members fanned behind each other: a collection
 * reads as a stack, and the stack is the artwork rather than a folder icon.
 */

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** How many assets one transaction can move. Each `add_to_collection` adds
 *  four accounts and its own ix data; eight stays clear of the 1232-byte
 *  limit with room for the blockhash and signatures. */
const BATCH = 8;

function toCard(a: OwnedAsset, collection?: { name: string; size: number }): NftCardData {
  // artworkUrl, not a.uri: an asset minted without its own picture points at
  // the metadata document, which renders as nothing in an <img>.
  const image = artworkUrl(a.uri);
  return {
    kind: "custom",
    name: a.name,
    ...(image ? { image } : {}),
    ...(collection ? { collection } : {}),
  };
}

export function CollectionShelf({
  collection,
  owner,
  /** Assets the wallet holds that could be moved in. */
  candidates,
  /** Every collection this wallet controls — an asset sitting in one of these
   *  can be moved out, because the wallet can authorise on its behalf. */
  ownedCollections,
  listing,
  onChanged,
}: {
  collection: CollectionData;
  owner: string;
  candidates: OwnedAsset[];
  ownedCollections: string[];
  /** This collection's live listing, when it has one. */
  listing?: CollectionAuctionData | null;
  onChanged: () => void;
}) {
  const readProgram = useReadonlyProgram();
  const program = useProgram();
  const [members, setMembers] = useState<OwnedAsset[] | null>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<ListingMode>("perpetual");
  const [price, setPrice] = useState("1");
  const [floor, setFloor] = useState("0.1");
  const [hours, setHours] = useState("24");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchCollectionAssets(
        readProgram,
        new PublicKey(collection.address),
      ).catch(() => []);
      if (!cancelled) setMembers(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, collection.address, nonce]);

  /**
   * Assets this wallet can actually move into the collection.
   *
   * Owning an asset is not enough. Core authorises UpdateV2 against the
   * asset's update authority, so an NFT you bought stays transferable but not
   * re-collectable — its authority is still whoever minted it. Offering those
   * looked fine until submit, then failed the whole batch with NoApprovals
   * (0x1a), taking the assets that would have worked down with it.
   *
   * Two cases pass: the wallet is the asset's own authority, or the asset sits
   * in a collection the wallet controls (so it can authorise the move out).
   */
  const controlled = candidates.filter(
    (c) =>
      c.updateAuthority === owner ||
      (c.collection !== null && ownedCollections.includes(c.collection)),
  );
  const movable = controlled.filter((c) => c.collection !== collection.address);
  /** Held but not movable — worth counting so the gap is explained, not hidden. */
  const notMovable = candidates.length - controlled.length;

  async function addChosen() {
    if (!program || chosen.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const picked = movable.filter((m) => chosen.has(m.asset));
      const me = new PublicKey(owner);
      const dest = new PublicKey(collection.address);

      for (let i = 0; i < picked.length; i += BATCH) {
        const slice = picked.slice(i, i + BATCH);
        const ixs = await Promise.all(
          slice.map((a) =>
            program.methods
              .addToCollection()
              .accountsPartial({
                payer: me,
                asset: new PublicKey(a.asset),
                // Null for a standalone asset — mpl-core takes the current
                // collection only when the asset is leaving one.
                currentCollection: a.collection ? new PublicKey(a.collection) : null,
                newCollection: dest,
              })
              .instruction(),
          ),
        );
        const tx = ixs.reduce((t, ix) => t.add(ix), new Transaction());
        await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });
      }

      setChosen(new Set());
      setPicking(false);
      setNonce((n) => n + 1);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add to collection");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Remove every member, restoring each as a standalone asset the wallet owns.
   *
   * Nothing is destroyed here — the assets outlive the collection — which is
   * why this is a plain action and only the delete below is gated.
   */
  async function emptyCollection() {
    if (!program || !members?.length) return;
    setBusy(true);
    setErr(null);
    try {
      const me = new PublicKey(owner);
      const dest = new PublicKey(collection.address);
      for (let i = 0; i < members.length; i += BATCH) {
        const ixs = await Promise.all(
          members.slice(i, i + BATCH).map((a) =>
            program.methods
              .removeFromCollection()
              .accountsPartial({
                payer: me,
                asset: new PublicKey(a.asset),
                collection: dest,
              })
              .instruction(),
          ),
        );
        const tx = ixs.reduce((t, ix) => t.add(ix), new Transaction());
        await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });
      }
      setNonce((n) => n + 1);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not empty collection");
    } finally {
      setBusy(false);
    }
  }

  /**
   * List the whole collection.
   *
   * Hands the collection's update authority to the escrow PDA, which is what a
   * buyer is actually buying — it carries every member, since each asset names
   * the collection as its own authority. While listed the wallet can no longer
   * mint into it or change it, because those are precisely the powers on sale.
   */
  async function listCollection() {
    if (!program) return;
    const terms = listingTerms(mode, price, floor, hours);
    if (!terms) return setErr("Check the price and duration.");
    setBusy(true);
    setErr(null);
    try {
      const toLamports = (n: number) => new BN(Math.round(n * 1e9).toString());
      await program.methods
        .listCollectionAuction(
          toLamports(terms.startPrice),
          toLamports(terms.floorPrice),
          new BN(terms.duration.toString()),
        )
        .accountsPartial({
          creator: new PublicKey(owner),
          collection: new PublicKey(collection.address),
        })
        .rpc();
      setListOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not list collection");
    } finally {
      setBusy(false);
    }
  }

  /** Take a live listing down and get the update authority back. */
  async function delistCollection() {
    if (!program) return;
    setBusy(true);
    setErr(null);
    try {
      await program.methods
        .reclaimCollectionAuction()
        .accountsPartial({
          payer: new PublicKey(owner),
          creator: new PublicKey(owner),
          collection: new PublicKey(collection.address),
        })
        .rpc();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delist collection");
    } finally {
      setBusy(false);
    }
  }

  /** Delete the (necessarily empty) collection and reclaim its rent. */
  async function deleteCollection() {
    if (!program) return;
    setBusy(true);
    setErr(null);
    try {
      await program.methods
        .burnCollection()
        .accountsPartial({
          authority: new PublicKey(owner),
          collection: new PublicKey(collection.address),
        })
        .rpc();
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete collection");
    } finally {
      setBusy(false);
    }
  }

  // A listing only constrains this collection while it can still be bought.
  const listed = Boolean(listing && !listing.complete);
  const loading = members === null;
  // Core refuses to burn a collection that still holds assets, so the button
  // waits for the count rather than offering an action that would revert.
  const isEmpty = members !== null && members.length === 0;

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex items-start gap-4">
        {/* The pack. Closed it sits as a squared-up deck; opening fans it.
            Both states are pure transforms so the animation stays on the
            compositor — see .af-pack-card in globals.css. */}
        {/* Shared with the market listing, so a set looks the same to the
            person selling it and the person deciding whether to buy it. */}
        <CollectionDeck
          name={collection.name}
          size={collection.size}
          members={members}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          emptyAction={{ label: "Add NFTs to", onClick: () => setPicking(true) }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[13px] font-bold">{collection.name}</div>
            <button onClick={() => setOpen((o) => !o)} aria-label="Toggle contents">
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-[#6B6B6B] transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
            {collection.size} {collection.size === 1 ? "asset" : "assets"} ·{" "}
            {short(collection.address)}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {listed ? (
              <button
                onClick={() => void delistCollection()}
                disabled={busy}
                title="Take the listing down and get the collection back"
                className="inline-flex items-center gap-1 rounded-sm border border-noise/40 px-2.5 py-1.5 font-mono text-[10px] font-bold text-noise disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                DELIST
              </button>
            ) : (
              <button
                onClick={() => setListOpen((o) => !o)}
                disabled={busy || loading}
                className="inline-flex items-center gap-1 rounded-sm border border-white/15 px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#F5F4F0] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Tag className="h-3 w-3" />
                {listOpen ? "CANCEL" : "SELL SET"}
              </button>
            )}

            <button
              onClick={() => setPicking((p) => !p)}
              disabled={movable.length === 0 || busy || loading || listed}
              className="inline-flex items-center gap-1 rounded-sm border border-signal/40 bg-signal/10 px-2.5 py-1.5 font-mono text-[10px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              {picking ? "CANCEL" : `ADD NFTS${movable.length ? ` (${movable.length})` : ""}`}
            </button>

            {members !== null && members.length > 0 && (
              <button
                onClick={() => void emptyCollection()}
                disabled={busy || listed}
                title="Return every asset to your wallet as a standalone NFT"
                className="inline-flex items-center gap-1 rounded-sm border border-white/15 px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#F5F4F0] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageOpen className="h-3 w-3" />}
                EMPTY ({members.length})
              </button>
            )}

            {/* Only offered once it's empty — Core rejects the burn otherwise,
                and a button that always reverts is worse than no button. */}
            {isEmpty && (
              <button
                onClick={() => setConfirmDelete((c) => !c)}
                disabled={busy || listed}
                className="inline-flex items-center gap-1 rounded-sm border border-noise/40 px-2.5 py-1.5 font-mono text-[10px] font-bold text-noise disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />
                {confirmDelete ? "CANCEL" : "DELETE"}
              </button>
            )}
          </div>
        </div>
      </div>

      {listed && listing && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <Notice tone="caution" title="This collection is on sale">
            The whole set is listed for{" "}
            <span className="font-mono text-signal">
              {(Number(listing.startPrice) / 1e9).toFixed(3)} SOL
            </span>
            {listing.duration === 0 ? " with no deadline" : ""}. Its update authority sits in
            escrow until it sells or you delist, so adding, emptying and deleting are unavailable
            — those are the powers a buyer would be paying for. Members can&apos;t be listed
            separately either, or someone could buy the set and watch pieces leave it.
          </Notice>
        </div>
      )}

      {listOpen && !listed && (
        <div className="mt-4 space-y-4 border-t border-white/[0.06] pt-3.5">
          <Notice tone="caution" title="Selling a set sells control of it">
            A collection has no owner in Metaplex Core — it has an update authority, and that is
            what changes hands. The buyer gets authority over all {collection.size}{" "}
            {collection.size === 1 ? "piece" : "pieces"} at once without a single asset moving.
            Until it sells you can&apos;t mint into it, and you get everything back if you delist.
          </Notice>

          <ListingFields
            mode={mode}
            onModeChange={setMode}
            price={price}
            onPriceChange={setPrice}
            floor={floor}
            onFloorChange={setFloor}
            hours={hours}
            onHoursChange={setHours}
            subject="collection"
          />

          <button
            onClick={() => void listCollection()}
            disabled={busy || !listingTerms(mode, price, floor, hours)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-signal px-4 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {busy ? "LISTING…" : `LIST ${collection.name.toUpperCase()}`}
          </button>
        </div>
      )}

      {/* Two across on a phone, not three. NftCardFace carries p-4 and type
          sized for roughly a 176px card; inside an already-padded shelf, three
          columns left each card near 90px wide and its own labels printed over
          each other — the same squeeze the genesis card had. */}
      {open && members !== null && members.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((m) => (
            <div key={m.asset}>
              <NftCardFace data={toCard(m, { name: collection.name, size: collection.size })} />
              <div className="mt-1.5 truncate text-center font-mono text-[10px] text-[#6B6B6B]">
                {m.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && members !== null && members.length === 0 && (
        <p className="mt-3 border-t border-white/[0.06] pt-3 font-mono text-[10px] text-[#6B6B6B]">
          Nothing in here yet.
        </p>
      )}

      {confirmDelete && (
        <div className="mt-4 border-t border-white/[0.06] pt-3.5">
          <Notice tone="danger" title="DELETING THIS COLLECTION IS PERMANENT">
            The collection account is closed and its rent returned to you. The address stops
            resolving, so anything that referenced it — an explorer link, a saved page — breaks.
            Assets that were in it are unaffected; they&apos;re already standalone NFTs in your
            wallet. Recreating gives you a new collection at a new address, not this one back.
          </Notice>
          {err && <p className="mt-2 font-mono text-[10px] text-noise">{err}</p>}
          <button
            onClick={() => void deleteCollection()}
            disabled={busy}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm bg-noise px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {busy ? "DELETING…" : `DELETE ${collection.name.toUpperCase()}`}
          </button>
        </div>
      )}

      {open && members === null && (
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
          <Loader2 className="h-3 w-3 animate-spin text-signal" />
          <span className="font-mono text-[10px] text-[#6B6B6B]">Reading contents…</span>
        </div>
      )}

      {picking && (
        <div className="mt-4 border-t border-white/[0.06] pt-3.5">
          <div className="text-[12px] font-bold">Add to {collection.name}</div>
          <Notice tone="info" title="MOVING IS REVERSIBLE" className="mt-2">
            An asset belongs to one collection at a time, so adding it here takes it out of
            whichever it was in. You keep authority either way and can move it again.
            Soulbound credentials aren&apos;t listed — their update authority is the program,
            and Core refuses to move them.
          </Notice>

          {/* An empty picker is a dead end unless it says why. The wallet
              either holds nothing standalone, or everything it holds is
              already here — different situations, and only one of them is
              solved by minting. */}
          {movable.length === 0 && (
            <div className="mt-3 rounded-sm border border-dashed border-white/12 p-6 text-center">
              <p className="font-mono text-[11px] text-[#6B6B6B]">
                {candidates.length === 0
                  ? "No NFTs in this wallet to add yet."
                  : notMovable === candidates.length
                    ? "None of your NFTs can be moved — a collection can only take assets you're the update authority for, and these were minted by someone else."
                    : "Everything you can move is already in this collection."}
              </p>
              {candidates.length === 0 && (
                <Link
                  href="/nft/create"
                  className="mt-2 inline-block font-mono text-[11px] font-bold text-signal"
                >
                  Mint one →
                </Link>
              )}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {movable.map((m) => {
              const isChosen = chosen.has(m.asset);
              return (
                <button
                  key={m.asset}
                  onClick={() =>
                    setChosen((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.asset)) next.delete(m.asset);
                      else next.add(m.asset);
                      return next;
                    })
                  }
                  className={cn(
                    "rounded-md p-1 text-left transition-colors",
                    isChosen ? "bg-signal/15 ring-1 ring-signal" : "hover:bg-white/[0.04]",
                  )}
                >
                  <NftCardFace data={toCard(m, { name: collection.name, size: collection.size })} />
                  <div className="mt-1 truncate font-mono text-[9px] text-[#6B6B6B]">
                    {m.name}
                  </div>
                  {m.collection && (
                    <div className="truncate font-mono text-[8px] text-[#4b5563]">
                      in {short(m.collection)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {err && <p className="mt-2 font-mono text-[10px] text-noise">{err}</p>}

          {movable.length > 0 && (
          <button
            onClick={() => void addChosen()}
            disabled={busy || chosen.size === 0}
            className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {busy
              ? "MOVING…"
              : `ADD ${chosen.size || ""}`.trim() +
                (chosen.size > BATCH ? ` · ${Math.ceil(chosen.size / BATCH)} txs` : "")}
          </button>
          )}
        </div>
      )}
    </div>
  );
}
