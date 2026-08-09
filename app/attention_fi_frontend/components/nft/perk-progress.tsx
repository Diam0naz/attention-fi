"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/notice";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { explorerTx } from "@/lib/solana/config";
import {
  MAX_PERK_LEVEL,
  PERK_THRESHOLDS_SOL,
  claimEarnedPerk,
  fetchTraderActivity,
  levelUpPerk,
  openTraderStats,
  type TraderActivity,
} from "@/lib/solana/perks";

const TIER_NAMES = ["Initiate", "Trader", "Pro", "Elite", "Apex"];

/** Discount a level gives, as a share of the trading fee. 10% per level. */
const discountPct = (level: number) => level * 10;

const short = (s: string) => `${s.slice(0, 8)}…`;

/**
 * The ladder a trader climbs to a fee discount, and the buttons that climb it.
 *
 * The thresholds and the scoring rule were in the program from the start and
 * nothing referenced them: a perk could only arrive as an admin-issued grant,
 * which made a discount the docs called earned into one the protocol handed
 * out. This screen drives the instructions that changed that — open the
 * activity record, claim at the level your trading has bought, and level up
 * as it grows — none of which need anyone's signature but the holder's.
 */
export function PerkProgress({
  address,
  perk,
  onChanged,
}: {
  address: string;
  /** The perk already held, if any. */
  perk: { level: number; asset: string } | null;
  /** Re-read the portfolio after a claim or level-up lands. */
  onChanged: () => void;
}) {
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();

  const [activity, setActivity] = useState<TraderActivity | null>(null);
  // "unread" until the first fetch resolves, so "no record" and "not looked
  // yet" can't be confused — they call for opposite things on screen.
  const [status, setStatus] = useState<"unread" | "none" | "ready">("unread");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const a = await fetchTraderActivity(readProgram, new PublicKey(address)).catch(() => null);
    setActivity(a);
    setStatus(a ? "ready" : "none");
  }, [readProgram, address]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = await fetchTraderActivity(readProgram, new PublicKey(address)).catch(() => null);
      if (cancelled) return;
      setActivity(a);
      setStatus(a ? "ready" : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, address]);

  async function run(
    label: string,
    detail: string,
    action: () => Promise<string>,
    done: string,
  ) {
    if (!signProgram) return;
    setBusy(true);
    setTx({ state: "pending", title: label, detail });
    try {
      const sig = await action();
      setTx({
        state: "confirmed",
        title: done,
        detail,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      await refresh();
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTx({
        state: "failed",
        title: `${label} failed`,
        detail: msg.includes("InsufficientActivity")
          ? "Your activity is below the threshold for that level."
          : msg.slice(0, 140),
      });
    } finally {
      setBusy(false);
    }
  }

  const owner = new PublicKey(address);
  const held = perk?.level ?? 0;
  const nextRung = PERK_THRESHOLDS_SOL[held];
  const canLevelUp =
    perk !== null && held < MAX_PERK_LEVEL && activity !== null && nextRung !== undefined
      ? activity.scoreSol >= nextRung
      : false;
  const canClaim = perk === null && (activity?.earnedLevel ?? 0) >= 1;

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-signal" />
        <span className="text-[13px] font-bold">Your trading activity</span>
        {status === "ready" && activity && (
          <span className="ml-auto font-mono text-[11px] text-signal">
            {activity.scoreSol.toFixed(2)} SOL
          </span>
        )}
      </div>

      {status === "unread" ? (
        <p className="mt-3 font-mono text-[11px] text-[#6B6B6B]">Reading your activity…</p>
      ) : status === "none" ? (
        <>
          <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-[#6B6B6B]">
            Perk levels are gated on how much you&apos;ve traded, and that has to be counted
            somewhere. Opening the record is a one-time transaction you sign and pay for —
            after it, every trade you make counts toward the next level automatically.
          </p>
          <Notice tone="info" title="NOTHING BEFORE THIS POINT COUNTS" className="mt-3 max-w-lg">
            The record starts at zero. Trades you made earlier aren&apos;t backfilled, because
            the only way to credit them would be an admin writing numbers into your account —
            which is the arrangement this whole path exists to remove.
          </Notice>
          <button
            onClick={() =>
              void run(
                "Opening your activity record",
                "One-time, and yours alone",
                () => openTraderStats(signProgram!, owner),
                "Activity record open",
              )
            }
            disabled={busy || !signProgram}
            className="mt-4 rounded-sm bg-signal px-5 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
          >
            {busy ? "OPENING…" : "START COUNTING MY TRADING"}
          </button>
        </>
      ) : (
        activity && (
          <>
            <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
              {activity.volumeSol.toFixed(2)} SOL traded
              {activity.depositsSol > 0 && (
                <> · {activity.depositsSol.toFixed(2)} SOL committed, counted double</>
              )}
            </div>

            {/* The ladder, with the rungs cleared marked. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PERK_THRESHOLDS_SOL.map((required, i) => {
                const cleared = activity.scoreSol >= required;
                return (
                  <div
                    key={required}
                    className={cn(
                      "rounded-sm border px-2.5 py-1.5 font-mono text-[10px]",
                      cleared
                        ? "border-signal/40 bg-signal/[0.06] text-signal"
                        : "border-white/10 text-[#6B6B6B]",
                    )}
                  >
                    <span className={cleared ? "font-bold" : "text-[#F5F4F0]"}>
                      {TIER_NAMES[i]}
                    </span>{" "}
                    · {required} SOL · {discountPct(i + 1)}% off
                  </div>
                );
              })}
            </div>

            {activity.toNextSol !== null && activity.toNextSol > 0 && (
              <p className="mt-3 font-mono text-[11px] text-[#6B6B6B]">
                {activity.toNextSol.toFixed(2)} SOL of trading to the next level.
              </p>
            )}

            {canClaim && (
              <button
                onClick={() =>
                  void run(
                    "Claiming your perk",
                    `Level ${activity.earnedLevel} · ${discountPct(activity.earnedLevel)}% off every trade`,
                    async () => {
                      const { signature } = await claimEarnedPerk(
                        signProgram!,
                        owner,
                        (asset) => `${window.location.origin}/api/nft/perk/${asset.toBase58()}`,
                      );
                      return signature;
                    },
                    "Perk claimed",
                  )
                }
                disabled={busy || !signProgram}
                className="mt-4 rounded-sm bg-signal px-5 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
              >
                {busy
                  ? "CLAIMING…"
                  : `CLAIM YOUR LEVEL ${activity.earnedLevel} PERK`}
              </button>
            )}

            {canLevelUp && perk && (
              <button
                onClick={() =>
                  void run(
                    "Levelling up",
                    `Level ${held} → ${held + 1}`,
                    () => levelUpPerk(signProgram!, owner, new PublicKey(perk.asset)),
                    `Now level ${held + 1}`,
                  )
                }
                disabled={busy || !signProgram}
                className="mt-4 rounded-sm bg-signal px-5 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
              >
                {busy ? "LEVELLING UP…" : `LEVEL UP TO ${held + 1}`}
              </button>
            )}

            {!canClaim && !canLevelUp && perk === null && (
              <p className="mt-4 max-w-lg text-[12px] leading-relaxed text-[#6B6B6B]">
                {PERK_THRESHOLDS_SOL[0]} SOL of trading mints your first perk. No grant, no
                waiting — the program checks the number and issues it.
              </p>
            )}
          </>
        )
      )}

      {tx && (
        <div className="mt-4">
          <TxStatus {...tx} onDismiss={() => setTx(null)} />
        </div>
      )}
    </div>
  );
}
