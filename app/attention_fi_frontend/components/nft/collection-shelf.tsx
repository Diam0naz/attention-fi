"use client";

import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { ChevronDown, Layers, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { Notice } from "@/components/ui/notice";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import {
  fetchCollectionAssets,
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

function toCard(a: OwnedAsset): NftCardData {
  return { kind: "custom", name: a.name, ...(a.uri ? { image: a.uri } : {}) };
}

export function CollectionShelf({
  collection,
  owner,
  /** Assets the wallet holds that could be moved in. */
  candidates,
  onChanged,
}: {
  collection: CollectionData;
  owner: string;
  candidates: OwnedAsset[];
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

  // Anything already here can't be added again; everything else the wallet
  // holds is fair game, including assets sitting in another of its collections.
  const movable = candidates.filter((c) => c.collection !== collection.address);

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

  const cover = (members ?? []).slice(0, 3);

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex items-start gap-4">
        {/* Fanned cover — the stack IS the collection's likeness. */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative h-24 w-[72px] shrink-0"
          aria-label={`${open ? "Hide" : "Show"} ${collection.name} contents`}
        >
          {cover.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/12">
              <Layers className="h-5 w-5 text-[#4b5563]" />
            </div>
          ) : (
            cover.map((m, i) => (
              <div
                key={m.asset}
                className="absolute inset-0 origin-bottom transition-transform duration-300"
                style={{
                  transform: `translateX(${i * 6}px) rotate(${(i - 1) * 4}deg)`,
                  zIndex: cover.length - i,
                }}
              >
                <NftCardFace data={toCard(m)} />
              </div>
            ))
          )}
        </button>

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

          <button
            onClick={() => setPicking((p) => !p)}
            disabled={movable.length === 0}
            className="mt-2.5 inline-flex items-center gap-1 rounded-sm border border-signal/40 bg-signal/10 px-2.5 py-1.5 font-mono text-[10px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            {picking ? "CANCEL" : `ADD NFTS${movable.length ? ` (${movable.length})` : ""}`}
          </button>
        </div>
      </div>

      {open && members !== null && members.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-white/[0.06] pt-3.5 sm:grid-cols-5">
          {members.map((m) => (
            <div key={m.asset}>
              <NftCardFace data={toCard(m)} />
              <div className="mt-1 truncate text-center font-mono text-[9px] text-[#6B6B6B]">
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

          <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
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
                  <NftCardFace data={toCard(m)} />
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
        </div>
      )}
    </div>
  );
}
