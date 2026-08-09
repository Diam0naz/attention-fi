"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { Coins } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram } from "@/lib/solana/use-program";
import { explorerTx } from "@/lib/solana/config";
import { claimAllCreatorFees, type CreatorFeeClaim } from "@/lib/solana/creator-fees";

const LAMPORTS_PER_SOL = 1_000_000_000;

const sol = (lamports: bigint) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);

/**
 * Withdraw the fees a creator's tokens have earned them.
 *
 * This exists because the figure was already on screen. The profile has shown a
 * CLAIMABLE FEES total since the on-chain reads landed, computed from each
 * curve's `creator_fees` — a real balance, set aside by the program on every
 * trade — while `claim_creator_fee` had no caller anywhere in the app. Showing
 * someone a balance with no way to take it is worse than not showing it.
 *
 * Claiming is per-curve, not per-wallet, so the total is broken out by token
 * and the sweep is a batch of instructions rather than one call.
 */
export function CreatorFeesPanel({
  claims,
  totalLamports,
  verified,
  loaded,
  onClaimed,
}: {
  claims: CreatorFeeClaim[];
  totalLamports: bigint;
  /** Whether the wallet holds a Verification PDA — the program requires one. */
  verified: boolean;
  loaded: boolean;
  /** Re-read balances after a claim lands. */
  onClaimed: () => void;
}) {
  const program = useProgram();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  async function claim(subset: CreatorFeeClaim[]) {
    if (!program) return;
    const creator = program.provider.publicKey;
    if (!creator) return;

    setBusy(true);
    setTx({
      state: "pending",
      title: subset.length === 1 ? `Claiming @${subset[0]!.handle}` : `Claiming ${subset.length} tokens`,
      detail: `${sol(subset.reduce((s, c) => s + c.lamports, 0n))} SOL`,
    });

    const { signatures, claimed, error } = await claimAllCreatorFees(
      program,
      new PublicKey(creator),
      subset,
      (done, total) => setProgress({ done, total }),
    );
    const last = signatures.at(-1);

    if (error && claimed === 0) {
      setTx({
        state: "failed",
        title: "Claim failed",
        detail: readableError(error),
      });
    } else if (error) {
      // Some batches landed. Reporting this as a plain failure would tell the
      // creator nothing arrived when in fact some of it did, and they'd retry
      // the whole sweep expecting the full amount.
      setTx({
        state: "failed",
        title: `Claimed ${claimed} of ${subset.length}`,
        detail: `${readableError(error)} — the rest is still claimable.`,
        signature: last ? `${last.slice(0, 8)}…` : undefined,
        explorerUrl: last ? explorerTx(last) : undefined,
      });
    } else {
      setTx({
        state: "confirmed",
        title: `Claimed ${sol(subset.reduce((s, c) => s + c.lamports, 0n))} SOL`,
        detail: subset.length === 1 ? `@${subset[0]!.handle}` : `${subset.length} tokens`,
        signature: last ? `${last.slice(0, 8)}…` : undefined,
        explorerUrl: last ? explorerTx(last) : undefined,
      });
    }

    setBusy(false);
    setProgress(null);
    onClaimed();
  }

  // Nothing accrued and nothing to explain — the stat above already reads $0.
  if (loaded && claims.length === 0) return null;

  return (
    <div className="rounded-sm border border-signal/25 bg-signal/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Coins className="h-4 w-4 shrink-0 text-signal" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold">Creator fees</div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
            {loaded
              ? `${sol(totalLamports)} SOL across ${claims.length} token${claims.length === 1 ? "" : "s"}`
              : "Reading balances…"}
          </div>
        </div>
        {verified && claims.length > 0 && (
          <button
            onClick={() => void claim(claims)}
            disabled={busy || !program}
            className="ml-auto rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] transition-opacity disabled:opacity-40"
          >
            {busy
              ? progress
                ? `CLAIMING ${progress.done}/${progress.total}`
                : "CLAIMING…"
              : claims.length === 1
                ? "CLAIM"
                : "CLAIM ALL"}
          </button>
        )}
      </div>

      {!verified && claims.length > 0 && (
        <Notice tone="caution" title="VERIFY YOUR HANDLE TO CLAIM" className="mt-3">
          The program pays creator fees to the verified owner of the X account, not to whichever
          wallet launched the mint — so the claim needs your verification badge and can&apos;t be
          built without it. The balance keeps accruing meanwhile; nothing is lost by verifying
          later.{" "}
          <Link href="/launch" className="text-signal hover:underline">
            Verify your handle →
          </Link>
        </Notice>
      )}

      {claims.length > 1 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {claims.map((c) => (
            <div
              key={c.mint}
              className="flex items-center gap-3 rounded-sm border border-white/[0.06] bg-[#0f1620] px-3 py-2"
            >
              <Link
                href={`/token/${c.handle}`}
                className="font-mono text-[11px] font-bold hover:text-signal"
              >
                @{c.handle}
              </Link>
              <span className="ml-auto font-mono text-[11px] text-signal">{sol(c.lamports)} SOL</span>
              {verified && (
                <button
                  onClick={() => void claim([c])}
                  disabled={busy || !program}
                  className="rounded-sm border border-signal/40 px-2.5 py-1 font-mono text-[9px] font-bold text-signal transition-colors hover:bg-signal/10 disabled:opacity-40"
                >
                  CLAIM
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tx && (
        <div className="mt-3">
          <TxStatus {...tx} onDismiss={() => setTx(null)} />
        </div>
      )}
    </div>
  );
}

/**
 * Turn the program's errors into something a creator can act on.
 *
 * `NoCreatorFees` is the one worth translating: it means the balance moved
 * between the read and the click — almost always because the claim already
 * landed — and the raw name reads like a bug.
 */
function readableError(e: Error): string {
  const msg = e.message;
  if (msg.includes("NoCreatorFees")) return "Already claimed — the balance was zero on arrival.";
  if (msg.includes("AccountNotInitialized")) return "Your handle isn't verified yet.";
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}
