"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Megaphone, X } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchFeeConfig } from "@/lib/solana/curve";
import { explorerTx } from "@/lib/solana/config";
import { promoteListing } from "@/lib/solana/promotions";

const LAMPORTS_PER_SOL = 1_000_000_000;

/** The program's own ceiling (`MAX_PROMO_DAYS`), so the form can't over-ask. */
const MAX_DAYS = 30;

const DAY_CHOICES = [1, 3, 7, 30] as const;

/**
 * Buy placement on one of your listings.
 *
 * Deliberately priced at read time rather than from a cached figure: the daily
 * rate lives in `FeeConfig` and the authority can retune it without a redeploy,
 * so the quote shown here is read fresh and then passed to the program as
 * `max_lamports`. That guard is what makes the number on screen binding — a
 * transaction signed against one price cannot settle at another.
 */
export function PromoteDialog({
  subject,
  kind,
  name,
  onClose,
  onDone,
}: {
  subject: string;
  kind: "asset" | "collection";
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const program = useProgram();
  const readProgram = useReadonlyProgram();
  const [days, setDays] = useState<number>(7);
  const [perDay, setPerDay] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchFeeConfig(readProgram).catch(() => null);
      if (!cancelled) setPerDay(cfg ? cfg.promoLamportsPerDay : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram]);

  const total = perDay === null ? null : perDay * BigInt(days);
  const totalSol = total === null ? null : Number(total) / LAMPORTS_PER_SOL;

  async function submit() {
    if (!program || total === null) return;
    const payer = program.provider.publicKey;
    if (!payer) return;
    setBusy(true);
    setTx({
      state: "pending",
      title: `Promoting for ${days} day${days === 1 ? "" : "s"}`,
      detail: `${totalSol?.toFixed(4)} SOL`,
    });
    try {
      const sig = await promoteListing(
        program,
        new PublicKey(payer),
        new PublicKey(subject),
        kind,
        days,
        total,
      );
      setTx({
        state: "confirmed",
        title: "Placement bought",
        detail: `${name} · ${days} day${days === 1 ? "" : "s"}`,
        signature: `${sig.slice(0, 8)}…`,
        explorerUrl: explorerTx(sig),
      });
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTx({
        state: "failed",
        title: "Promotion failed",
        detail: msg.includes("CostAboveMax")
          ? "The daily price changed while you were deciding — reopen for a fresh quote."
          : msg.slice(0, 140),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
      <div className="w-full max-w-sm rounded-sm border border-white/[0.1] bg-[#0f1620] p-5">
        <div className="flex items-start gap-2">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold">Promote this listing</div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-[#6B6B6B]">{name}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-[#F5F4F0]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-[#9a9a9a]">
          A promoted listing ranks above unpaid ones in the market, and is labelled as promoted
          wherever it appears. It buys position, not concealment.
        </p>

        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {DAY_CHOICES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={
                d === days
                  ? "rounded-sm border border-signal bg-signal/10 py-1.5 font-mono text-[10px] font-bold text-signal"
                  : "rounded-sm border border-white/10 py-1.5 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:border-signal/40 hover:text-signal"
              }
            >
              {d}d
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-between font-mono text-[11px]">
          <span className="text-[#6B6B6B]">Total</span>
          <span className="font-bold text-signal">
            {totalSol === null ? "—" : `${totalSol.toFixed(4)} SOL`}
          </span>
        </div>

        {perDay === null && (
          <Notice tone="caution" title="NO FEE SCHEDULE ON THIS DEPLOYMENT" className="mt-3">
            <code>FeeConfig</code> doesn&apos;t exist yet, so placement has no price and cannot
            be bought. An admin creates it from the admin console.
          </Notice>
        )}

        <Notice tone="info" title="DAYS STACK, THEY DON'T REPLACE" className="mt-3">
          Buying while a promotion is still running extends from where it ends, so topping up
          never destroys time you already paid for. Up to {MAX_DAYS} days at once.
        </Notice>

        <button
          onClick={() => void submit()}
          disabled={busy || perDay === null || !program}
          className="mt-4 w-full rounded-sm bg-signal py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
        >
          {busy ? "BUYING PLACEMENT…" : "BUY PLACEMENT"}
        </button>

        {tx && (
          <div className="mt-3">
            <TxStatus {...tx} onDismiss={() => setTx(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
