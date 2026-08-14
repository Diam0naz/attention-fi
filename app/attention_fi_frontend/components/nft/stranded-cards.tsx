"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { PackageOpen } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { explorerTx } from "@/lib/solana/config";
import { findStrandedCards, transferV1, type StrandedCard } from "@/lib/solana/stranded-cards";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Solana caps a transaction's size, and each transfer adds accounts. */
const PER_TX = 6;

/**
 * Hand over cards from collections that were sold before the escrow fix.
 *
 * The wallet holding them is the only signer mpl-core will accept, so this has
 * to happen here rather than from a script or an admin key. Reachable on a
 * phone for the same reason — the wallet that owes the cards is whichever one
 * made the sale, and that is often not the one at a desk.
 */
export function StrandedCards() {
  const { address, connected } = useWallet();
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();

  const [cards, setCards] = useState<StrandedCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!address) return setCards(null);
    setCards(await findStrandedCards(readProgram, new PublicKey(address)).catch(() => []));
  }, [address, readProgram]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) return;
      const found = await findStrandedCards(readProgram, new PublicKey(address)).catch(() => []);
      if (!cancelled) setCards(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, readProgram]);

  async function deliver() {
    if (!signProgram || !address || !cards?.length) return;
    setBusy(true);
    const me = new PublicKey(address);
    try {
      const batches: StrandedCard[][] = [];
      for (let i = 0; i < cards.length; i += PER_TX) batches.push(cards.slice(i, i + PER_TX));

      let last = "";
      for (const [n, batch] of batches.entries()) {
        setTx({
          state: "pending",
          title: `Delivering ${batch.length} card${batch.length > 1 ? "s" : ""}`,
          detail: batches.length > 1 ? `Batch ${n + 1} of ${batches.length}` : "Approve in your wallet",
        });
        const t = new Transaction();
        for (const c of batch) {
          t.add(
            transferV1(
              new PublicKey(c.asset),
              new PublicKey(c.collection),
              me,
              new PublicKey(c.owedTo),
            ),
          );
        }
        last = await signProgram.provider.sendAndConfirm!(t, [], { commitment: "confirmed" });
      }
      setTx({
        state: "confirmed",
        title: "Cards delivered",
        detail: `${cards.length} card${cards.length > 1 ? "s" : ""} handed over`,
        signature: short(last),
        explorerUrl: explorerTx(last),
      });
      await load();
    } catch (e) {
      setTx({
        state: "failed",
        title: "Delivery failed",
        detail: (e instanceof Error ? e.message : String(e)).slice(0, 160),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <Notice tone="info" title="CONNECT THE WALLET THAT SOLD THE COLLECTION">
        Only the wallet still holding the cards can hand them over — mpl-core requires the
        owner&apos;s signature, and neither the buyer nor the protocol can substitute for it.
      </Notice>
    );
  }

  if (cards === null) {
    return <p className="font-mono text-[11px] text-[#6B6B6B]">Checking…</p>;
  }

  if (cards.length === 0) {
    return (
      <Notice tone="info" title="NOTHING OWED">
        No cards from sold collections are sitting in this wallet. Collections sold from now on
        hand their members over as part of the sale, so this stays empty.
      </Notice>
    );
  }

  const owedTo = [...new Set(cards.map((c) => c.owedTo))];

  return (
    <div className="rounded-sm border border-noise/30 bg-noise/[0.04] p-4">
      <div className="flex items-center gap-2">
        <PackageOpen className="h-4 w-4 text-noise" />
        <span className="text-[13px] font-bold">
          {cards.length} card{cards.length > 1 ? "s" : ""} owed to {owedTo.length} buyer
          {owedTo.length > 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-[#9a9a9a]">
        These collections sold before the sale handed over their members, so the cards stayed
        here while the deck went to the buyer. Delivering them completes sales that were already
        paid for.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {cards.map((c) => (
          <div
            key={c.asset}
            className="flex flex-wrap items-center gap-3 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2"
          >
            <span className="text-[12px]">{c.name}</span>
            <span className="font-mono text-[10px] text-[#6B6B6B]">
              {short(c.collection)} → {short(c.owedTo)}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => void deliver()}
        disabled={busy}
        className="mt-4 w-full rounded-sm bg-signal py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-40"
      >
        {busy ? "DELIVERING…" : `DELIVER ${cards.length} CARD${cards.length > 1 ? "S" : ""}`}
      </button>
      {cards.length > PER_TX && (
        <p className="mt-2 text-center font-mono text-[10px] text-[#6B6B6B]">
          {Math.ceil(cards.length / PER_TX)} transactions — approve each
        </p>
      )}

      {tx && (
        <div className="mt-3">
          <TxStatus {...tx} onDismiss={() => setTx(null)} />
        </div>
      )}
    </div>
  );
}
