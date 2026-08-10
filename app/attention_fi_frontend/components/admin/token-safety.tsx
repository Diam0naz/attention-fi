"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { OctagonAlert, ShieldOff } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { explorerTx } from "@/lib/solana/config";
import { launchPolicyPda } from "@/lib/solana/program";
import {
  REASON_COPY,
  disavowToken,
  fetchAllDisavowals,
  restoreToken,
  type Disavowal,
  type DisavowReason,
} from "@/lib/solana/disavowal";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const REASONS: DisavowReason[] = ["disowned", "subjectGone", "abuse"];

/** Mirrors `MAX_LAUNCH_SLOTS` — the program refuses a cap above the ring. */
const MAX_LAUNCHES = 8;

/**
 * The two levers for a token that shouldn't be traded, and the one for a wallet
 * launching too many.
 *
 * Both were reachable only from a script until now, which for the disavowal is
 * the same as not existing: the whole point is acting within minutes of a
 * subject objecting in public, and "clone the repo and run ts-node" is not that.
 */
export function TokenSafety({ isAdmin }: { isAdmin: boolean }) {
  const { address } = useWallet();
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();

  const [flagged, setFlagged] = useState<Disavowal[]>([]);
  const [mintInput, setMintInput] = useState("");
  const [reason, setReason] = useState<DisavowReason>("disowned");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<{ max: string; hours: string }>({ max: "3", hours: "24" });
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setFlagged(await fetchAllDisavowals(readProgram).catch(() => []));
  }, [readProgram]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchAllDisavowals(readProgram).catch(() => []);
      if (!cancelled) setFlagged(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram]);

  async function run(title: string, detail: string, action: () => Promise<string>) {
    if (!signProgram || !address) return;
    setBusy(true);
    setTx({ state: "pending", title, detail });
    try {
      const sig = await action();
      setTx({
        state: "confirmed",
        title,
        detail,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTx({
        state: "failed",
        title: `${title} failed`,
        detail: msg.includes("Unauthorized")
          ? "Only the authority or a guardian can flag; only the authority can clear."
          : msg.slice(0, 160),
      });
    } finally {
      setBusy(false);
    }
  }

  let parsedMint: PublicKey | null = null;
  try {
    parsedMint = mintInput.trim() ? new PublicKey(mintInput.trim()) : null;
  } catch {
    parsedMint = null;
  }

  const maxLaunches = Number(policy.max);
  const windowSecs = Math.round(Number(policy.hours) * 3600);
  const policyValid =
    Number.isFinite(maxLaunches) &&
    maxLaunches >= 1 &&
    maxLaunches <= MAX_LAUNCHES &&
    Number.isFinite(windowSecs) &&
    windowSecs >= 1;

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex items-center gap-2">
        <ShieldOff className="h-4 w-4 text-noise" />
        <span className="text-[13px] font-bold">Token safety</span>
      </div>

      {/* ── disavowal ─────────────────────────────────────────── */}
      <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-[#9a9a9a]">
        Disowning a token closes buying and leaves selling and claiming open. Holders are not
        trapped — they just can&apos;t be joined by new ones. Any guardian can flag; only the
        authority can clear.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1">
          <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
            Token mint
          </label>
          <input
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            placeholder="Mint address"
            className="mt-1 w-full rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[11px] outline-none focus:border-signal/50"
          />
        </div>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as DisavowReason)}
          className="rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[11px] outline-none focus:border-signal/50"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_COPY[r].label}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            void run("Disowning token", `${short(mintInput.trim())} · ${REASON_COPY[reason].label}`, () =>
              disavowToken(signProgram!, new PublicKey(address!), parsedMint!, reason),
            )
          }
          disabled={busy || !parsedMint || !signProgram}
          className="rounded-sm border border-noise/50 bg-noise/10 px-4 py-2 font-mono text-[11px] font-bold text-noise disabled:opacity-40"
        >
          DISOWN
        </button>
      </div>
      {mintInput.trim() && !parsedMint && (
        <p className="mt-1 font-mono text-[10px] text-noise">Not a valid address.</p>
      )}

      {flagged.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[#6B6B6B]">
            CURRENTLY DISOWNED ({flagged.length})
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {flagged.map((f) => (
              <div
                key={f.mint}
                className="flex flex-wrap items-center gap-3 rounded-sm border border-noise/25 bg-noise/[0.04] px-3 py-2"
              >
                <OctagonAlert className="h-3.5 w-3.5 shrink-0 text-noise" />
                <span className="font-mono text-[11px]" title={f.mint}>
                  {short(f.mint)}
                </span>
                <span className="font-mono text-[10px] text-[#6B6B6B]">
                  {REASON_COPY[f.reason].label} · by {short(f.disavowedBy)}
                </span>
                {isAdmin && (
                  <button
                    onClick={() =>
                      void run("Restoring token", short(f.mint), () =>
                        restoreToken(signProgram!, new PublicKey(address!), new PublicKey(f.mint)),
                      )
                    }
                    disabled={busy}
                    className="ml-auto rounded-sm border border-white/15 px-2.5 py-1 font-mono text-[10px] text-[#9a9a9a] transition-colors hover:text-[#F5F4F0] disabled:opacity-40"
                  >
                    RESTORE
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── launch rate limit ─────────────────────────────────── */}
      {isAdmin && (
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[#6B6B6B]">
            LAUNCH RATE LIMIT
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <label className="font-mono text-[10px] text-[#6B6B6B]">Launches</label>
              <input
                type="number"
                min={1}
                max={MAX_LAUNCHES}
                value={policy.max}
                onChange={(e) => setPolicy((p) => ({ ...p, max: e.target.value }))}
                className="mt-1 w-20 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-2 py-1.5 font-mono text-[11px] outline-none focus:border-signal/50"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-[#6B6B6B]">per (hours)</label>
              <input
                type="number"
                min={0.01}
                value={policy.hours}
                onChange={(e) => setPolicy((p) => ({ ...p, hours: e.target.value }))}
                className="mt-1 w-24 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-2 py-1.5 font-mono text-[11px] outline-none focus:border-signal/50"
              />
            </div>
            <button
              onClick={() =>
                void run("Setting launch policy", `${maxLaunches} per ${policy.hours}h`, () =>
                  signProgram!.methods
                    .setLaunchPolicy(maxLaunches, new BN(windowSecs))
                    .accountsPartial({
                      authority: new PublicKey(address!),
                      policy: launchPolicyPda(),
                    })
                    .rpc(),
                )
              }
              disabled={busy || !policyValid || !signProgram}
              className="rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
            >
              SET POLICY
            </button>
          </div>
          <Notice tone="info" title="THE CAP CANNOT EXCEED WHAT IS REMEMBERED" className="mt-3">
            Each wallet keeps its last {MAX_LAUNCHES} launch times, and the window counts the
            ones inside it — so a cap above {MAX_LAUNCHES} could allow more launches than the
            record can hold and the limit would quietly stop binding. The program refuses that
            rather than accepting a number it can&apos;t honour. Leaving this unset means 3 per
            24 hours.
          </Notice>
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
