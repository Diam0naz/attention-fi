"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { OctagonAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/notice";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { explorerTx } from "@/lib/solana/config";
import {
  MAX_GUARDIANS,
  approveResume,
  fetchGuardians,
  isGuardian,
  parseGuardians,
  pauseProtocol,
  setGuardians,
  type GuardianState,
} from "@/lib/solana/guardians";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * The emergency stop.
 *
 * Two audiences on one panel, because they are two halves of one fact: the
 * authority chooses who holds a stop, and the guardians pull it. Splitting them
 * across screens would let the roster and the state drift apart in the reader's
 * head, which during an incident is the last thing anyone needs.
 *
 * The asymmetry is stated plainly rather than implied by which buttons are lit:
 * pausing takes one guardian, resuming takes a threshold, and the authority can
 * do neither.
 */
export function EmergencyStop({ isAdmin }: { isAdmin: boolean }) {
  const { address } = useWallet();
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();

  const [state, setState] = useState<GuardianState | null>(null);
  const [status, setStatus] = useState<"loading" | "none" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchGuardians(readProgram).catch(() => null);
    setState(s);
    setStatus(s ? "ready" : "none");
    if (s) setThreshold(s.threshold);
  }, [readProgram]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await fetchGuardians(readProgram).catch(() => null);
      if (cancelled) return;
      setState(s);
      setStatus(s ? "ready" : "none");
      if (s) setThreshold(s.threshold);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram]);

  async function run(title: string, detail: string, action: () => Promise<string>) {
    if (!signProgram) return;
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
        detail: msg.includes("NotGuardian")
          ? "That wallet isn't a guardian."
          : msg.includes("InvalidGuardianSet")
            ? "A set must be 1–5 distinct real keys with a threshold no larger than the set."
            : msg.slice(0, 160),
      });
    } finally {
      setBusy(false);
    }
  }

  const parsed = parseGuardians(raw);
  const canInstall =
    parsed.valid.length > 0 &&
    parsed.valid.length <= MAX_GUARDIANS &&
    parsed.invalid.length === 0 &&
    threshold >= 1 &&
    threshold <= parsed.valid.length;
  const iAmGuardian = isGuardian(state, address);
  const alreadyApproved = state !== null && address !== null && state.approvals.includes(address);

  return (
    <div
      className={cn(
        "rounded-sm border p-4",
        state?.paused ? "border-noise/40 bg-noise/[0.06]" : "border-white/[0.08] bg-[#0f1620]",
      )}
    >
      <div className="flex items-center gap-2">
        {state?.paused ? (
          <OctagonAlert className="h-4 w-4 text-noise" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-signal" />
        )}
        <span className="text-[13px] font-bold">Emergency stop</span>
        <span
          className={cn(
            "ml-auto rounded-sm px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide",
            status === "loading"
              ? "text-[#6B6B6B]"
              : state?.paused
                ? "bg-noise/20 text-noise"
                : "bg-signal/15 text-signal",
          )}
        >
          {status === "loading" ? "READING…" : state?.paused ? "PAUSED" : "LIVE"}
        </span>
      </div>

      {status === "none" ? (
        <Notice tone="danger" title="NO GUARDIANS INSTALLED" className="mt-3">
          Nothing can stop the protocol right now. Trades, swaps, migrations and market
          purchases all run unguarded, and there is no key that can halt them. Install a set
          below — the program treats an empty guardian account as &ldquo;not paused&rdquo;, which
          is what keeps a deploy from bricking trading, but it is not a state to stay in.
        </Notice>
      ) : (
        state && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {state.members.map((m) => (
                <span
                  key={m}
                  className={cn(
                    "rounded-sm border px-2 py-1 font-mono text-[10px]",
                    state.approvals.includes(m)
                      ? "border-signal/40 bg-signal/[0.08] text-signal"
                      : "border-white/10 text-[#6B6B6B]",
                    m === address && "ring-1 ring-signal/40",
                  )}
                  title={m}
                >
                  {short(m)}
                  {state.approvals.includes(m) ? " ✓" : ""}
                </span>
              ))}
            </div>
            <div className="mt-2 font-mono text-[10px] text-[#6B6B6B]">
              {state.threshold} of {state.members.length} to resume · one to pause
              {state.paused && ` · ${state.approvals.length}/${state.threshold} approved`}
            </div>
          </>
        )
      )}

      {/* Guardian actions */}
      {iAmGuardian && state && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          {state.paused ? (
            <>
              <p className="text-[11.5px] leading-relaxed text-[#9a9a9a]">
                Resuming needs {state.threshold} guardians. Yours is one signature; the call
                that reaches the threshold lifts the pause.
              </p>
              <button
                onClick={() =>
                  void run("Approving resume", `${state.approvals.length + 1}/${state.threshold}`, () =>
                    approveResume(signProgram!, new PublicKey(address!)),
                  )
                }
                disabled={busy || alreadyApproved}
                className="mt-2 rounded-sm border border-signal/40 bg-signal/10 px-4 py-2 font-mono text-[11px] font-bold text-signal disabled:opacity-40"
              >
                {alreadyApproved ? "YOU'VE APPROVED" : "APPROVE RESUME"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[11.5px] leading-relaxed text-[#9a9a9a]">
                You can stop the protocol alone and immediately. It halts trades, swaps,
                graduations and market purchases. It does <em>not</em> stop claims — money
                already owed stays withdrawable, because freezing that turns an incident into
                a run.
              </p>
              <button
                onClick={() =>
                  void run("Pausing the protocol", "All gated instructions refuse", () =>
                    pauseProtocol(signProgram!, new PublicKey(address!)),
                  )
                }
                disabled={busy}
                className="mt-2 rounded-sm border border-noise/50 bg-noise/10 px-4 py-2 font-mono text-[11px] font-bold text-noise disabled:opacity-40"
              >
                PAUSE EVERYTHING
              </button>
            </>
          )}
        </div>
      )}

      {/* Authority actions */}
      {isAdmin && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[#6B6B6B]">
            {status === "none" ? "INSTALL A SET" : "ROTATE THE SET"}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={3}
            placeholder="One guardian address per line (max 5)"
            className="mt-2 w-full resize-y rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[11px] outline-none focus:border-signal/50"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-[#6B6B6B]">Approvals to resume</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, parsed.valid.length || MAX_GUARDIANS)}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-16 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-2 py-1 font-mono text-[11px] outline-none focus:border-signal/50"
            />
            <span className="font-mono text-[10px] text-[#4b5563]">
              of {parsed.valid.length || "—"}
            </span>
          </div>
          {parsed.invalid.length > 0 && (
            <p className="mt-2 font-mono text-[10px] text-noise">
              Not valid addresses: {parsed.invalid.slice(0, 3).join(", ")}
            </p>
          )}
          <Notice tone="caution" title="YOU CHOOSE THEM; YOU ARE NOT ONE" className="mt-3">
            The authority installs and rotates guardians and can do nothing else here — it
            cannot pause, and it cannot resume. An authority key that could also lift a stop
            would make the threshold decorative, which is the whole point of having one. Add
            your own wallet to the list if you want a stop of your own.
          </Notice>
          <button
            onClick={() =>
              void run(
                status === "none" ? "Installing guardians" : "Rotating guardians",
                `${parsed.valid.length} guardians · ${threshold} to resume`,
                () => setGuardians(signProgram!, new PublicKey(address!), parsed.valid, threshold),
              )
            }
            disabled={busy || !canInstall || !signProgram}
            className="mt-3 rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
          >
            {status === "none" ? "INSTALL GUARDIANS" : "ROTATE GUARDIANS"}
          </button>
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
