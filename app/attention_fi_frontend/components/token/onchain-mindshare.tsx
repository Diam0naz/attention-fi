"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Radio, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { feedEnabledForHandle } from "@/lib/solana/mindshare-feed";
import {
  MAX_STALENESS_SLOTS,
  fetchOnchainMindshare,
  refreshOnchainMindshare,
  type OnchainMindshare,
} from "@/lib/solana/mindshare-oracle";

/**
 * What the *program* thinks this token's mindshare is.
 *
 * Deliberately separate from the mindshare shown everywhere else on the site.
 * That number is read live from the app's own API and refreshes constantly;
 * this one was written on-chain by whoever last paid to crank it, from a
 * Switchboard oracle reading a 24-hour average. They will disagree, and the
 * disagreement is the useful part: the on-chain value is the only one the
 * protocol can act on, and showing them as a single figure would hide whether
 * the chain knows anything at all.
 *
 * Until this shipped, `update_mindshare` had no caller and `MindshareState` had
 * no reader — the oracle wrote to an account nothing consumed.
 */
export function OnchainMindshare({ mint, handle }: { mint: string | null; handle: string }) {
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();
  const [state, setState] = useState<OnchainMindshare | null>(null);
  const [status, setStatus] = useState<"loading" | "none" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!mint) return;
    const s = await fetchOnchainMindshare(readProgram, new PublicKey(mint)).catch(() => null);
    setState(s);
    setStatus(s ? "ready" : "none");
  }, [readProgram, mint]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!mint) return;
      const s = await fetchOnchainMindshare(readProgram, new PublicKey(mint)).catch(() => null);
      if (cancelled) return;
      setState(s);
      setStatus(s ? "ready" : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, mint]);

  // Nothing honest to say about a token that isn't on-chain.
  if (!mint) return null;

  async function crank() {
    if (!signProgram || !mint) return;
    setBusy(true);
    setErr(null);
    try {
      await refreshOnchainMindshare(signProgram, new PublicKey(mint), handle);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const feedOn = feedEnabledForHandle(handle);

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-3.5">
      <div className="flex items-center gap-2">
        <Radio className="h-3.5 w-3.5 text-signal" />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          On-chain mindshare
        </span>
        {state && (
          <span
            className={cn(
              "ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold",
              state.fresh ? "bg-signal/15 text-signal" : "border border-white/10 text-[#6B6B6B]",
            )}
            title={
              state.fresh
                ? "Recent enough that the program would act on it"
                : `Older than ${MAX_STALENESS_SLOTS} slots — the program treats this as stale`
            }
          >
            {state.fresh ? "FRESH" : "STALE"}
          </span>
        )}
      </div>

      {status === "loading" ? (
        <p className="mt-2 font-mono text-[11px] text-[#6B6B6B]">Reading the chain…</p>
      ) : status === "none" ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#9a9a9a]">
          No snapshot on-chain yet. The oracle write is permissionless — anyone can pay to
          record this token&apos;s mindshare, and the value comes from Switchboard rather than
          from whoever calls it.
        </p>
      ) : (
        state && (
          <>
            <div className="mt-2 font-mono text-[22px] font-bold tabular-nums">
              {state.percent.toFixed(2)}
              <span className="text-[12px] text-[#6B6B6B]">%</span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
              {state.tierName} · written at slot {state.updatedSlot.toLocaleString()} ·{" "}
              {state.ageSlots.toLocaleString()} slots ago
            </div>
          </>
        )
      )}

      {feedOn ? (
        <button
          onClick={() => void crank()}
          disabled={busy || !signProgram}
          className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-signal/40 px-3 py-1.5 font-mono text-[10px] font-bold text-signal transition-colors hover:bg-signal/10 disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
          {busy ? "REFRESHING…" : status === "none" ? "RECORD IT ON-CHAIN" : "REFRESH FROM ORACLE"}
        </button>
      ) : (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#4b5563]">
          No feed configured for @{handle} on this deployment, so nothing can write here.
          Provision one with <code>scripts/create-feed.ts</code> and add it to{" "}
          <code>NEXT_PUBLIC_MINDSHARE_FEEDS</code>.
        </p>
      )}

      {err && <p className="mt-2 font-mono text-[10px] leading-relaxed text-noise">{err}</p>}
    </div>
  );
}
