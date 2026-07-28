"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { AlertTriangle, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchConvictionDetail, fetchGlobal, quoteBuy, type ConvictionDetail } from "@/lib/solana/curve";
import { buyConviction, quoteConvictionSell, sellConviction } from "@/lib/solana/trade";
import { explorerTx } from "@/lib/solana/config";

/**
 * Conviction-curve trade panel.
 *
 * Pricing is the same constant product as the bonding curve, so this keeps
 * buy/sell tabs. What differs is that every buy locks the position, and selling
 * while locked forfeits a percentage of the proceeds — both are stated up front
 * rather than discovered after signing.
 */

const POLL_MS = 8_000;

function duration(seconds: number): string {
  if (seconds <= 0) return "unlocked";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ConvictionPanel({ mint, symbol }: { mint: string; symbol: string }) {
  const { connected, address } = useWallet();
  const program = useProgram();
  const readonly = useReadonlyProgram();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [detail, setDetail] = useState<ConvictionDetail | null>(null);
  const [decimals, setDecimals] = useState(6);
  const [feeBps, setFeeBps] = useState(0);
  const [amount, setAmount] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  const mintKey = useMemo(() => (mint ? new PublicKey(mint) : null), [mint]);

  const load = useCallback(async () => {
    if (!mintKey) return null;
    const global = await fetchGlobal(readonly);
    const dec = global?.tokenDecimals ?? 6;
    setDecimals(dec);
    setFeeBps(global?.feeBps ?? 0);
    return fetchConvictionDetail(
      readonly,
      mintKey,
      dec,
      address ? new PublicKey(address) : null,
    );
  }, [readonly, mintKey, address]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await load().catch(() => null);
      if (!cancelled) setDetail(d);
    })();
    const poll = setInterval(() => {
      void load()
        .then((d) => {
          if (!cancelled && d) setDetail(d);
        })
        .catch(() => undefined);
    }, POLL_MS);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  async function submit() {
    if (!program || !address || !mintKey) return setWalletOpen(true);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setTxErr(null);
    setTx("pending");
    try {
      const signer = new PublicKey(address);
      const sig =
        side === "buy"
          ? await buyConviction(program, signer, mintKey, amt)
          : await sellConviction(program, signer, mintKey, amt, decimals);
      setTxSig(sig);
      setTx("confirmed");
      setAmount("");
      setDetail(await load().catch(() => detail));
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transaction failed");
      setTx("failed");
    }
  }

  if (!detail) {
    return (
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 font-mono text-[11px] text-[#6B6B6B]">
        Loading conviction curve…
      </div>
    );
  }

  const amt = Number(amount);
  const valid = Number.isFinite(amt) && amt > 0;
  const position = detail.position;
  const secondsToUnlock = position ? position.unlockTime - now : 0;
  const isLocked = position !== null && secondsToUnlock > 0;

  const buyPreview = valid ? quoteBuy(detail.curve, amt) / 10 ** decimals : 0;
  const sellQuote = quoteConvictionSell(detail, valid ? amt : 0, decimals, feeBps, now);
  const penaltyPct = detail.earlyExitPenaltyBps / 100;

  const canSubmit =
    valid &&
    !detail.complete &&
    (side === "buy" || (position !== null && amt <= position.amountTokens));

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="grid grid-cols-2 gap-1 rounded-sm bg-white/[0.04] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "rounded-sm py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors",
              side === s
                ? s === "buy"
                  ? "bg-signal text-[#0A0A0A]"
                  : "bg-noise text-[#0A0A0A]"
                : "text-[#6B6B6B] hover:text-[#F5F4F0]",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* the holder's own lock — the thing that decides what a sell costs */}
      <div className="mt-3 flex items-center gap-2 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2.5">
        {isLocked ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#FFB020]" />
        ) : (
          <Unlock className="h-3.5 w-3.5 shrink-0 text-signal" />
        )}
        <div className="min-w-0 font-mono text-[10px] leading-relaxed">
          {position ? (
            isLocked ? (
              <>
                <span className="text-[#FFB020]">Locked for {duration(secondsToUnlock)}</span>
                <span className="text-[#6B6B6B]">
                  {" "}
                  · {position.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                  {symbol}
                </span>
              </>
            ) : (
              <>
                <span className="text-signal">Unlocked</span>
                <span className="text-[#6B6B6B]">
                  {" "}
                  · {position.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                  {symbol} · sell with no penalty
                </span>
              </>
            )
          ) : (
            <span className="text-[#6B6B6B]">
              No position · buying locks for {duration(detail.lockPeriodSeconds)}
            </span>
          )}
        </div>
      </div>

      <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
        {side === "buy" ? "Amount (SOL)" : `Amount (${symbol})`}
      </label>
      <input
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0"
        className="mt-1 w-full rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[13px] outline-none focus:border-signal/50"
      />

      {side === "buy" ? (
        <>
          <div className="mt-2.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>You receive</span>
            <span className="text-[#F5F4F0]">
              {buyPreview > 0
                ? `≈ ${buyPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`
                : "—"}
            </span>
          </div>
          {/* Adding to a position resets the whole lock, not just the new
              tokens — easy to assume otherwise, and expensive to discover. */}
          <div className="mt-2.5 flex gap-2 rounded-sm border border-[#FFB020]/25 bg-[#FFB020]/[0.06] px-3 py-2">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-[#FFB020]" />
            <p className="font-mono text-[10px] leading-relaxed text-[#6B6B6B]">
              {position
                ? `Buying resets the lock on your entire position — all ${position.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol} relock for ${duration(detail.lockPeriodSeconds)}.`
                : `Locks for ${duration(detail.lockPeriodSeconds)}. Selling before then forfeits ${penaltyPct}% of proceeds.`}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>Gross</span>
            <span className="text-[#F5F4F0]">{sellQuote.grossSol.toFixed(6)} SOL</span>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>Protocol fee</span>
            <span>−{sellQuote.feeSol.toFixed(6)}</span>
          </div>
          {sellQuote.locked && (
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#FFB020]">
              <span>Early-exit penalty ({penaltyPct}%)</span>
              <span>−{sellQuote.penaltySol.toFixed(6)}</span>
            </div>
          )}
          <div className="mt-1.5 flex justify-between border-t border-white/[0.06] pt-1.5 font-mono text-[11px]">
            <span className="text-[#6B6B6B]">You receive</span>
            <span className="font-bold text-[#F5F4F0]">{sellQuote.netSol.toFixed(6)} SOL</span>
          </div>
          {position && valid && amt > position.amountTokens && (
            <p className="mt-2 font-mono text-[10px] text-noise">
              You only hold{" "}
              {position.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              {symbol}.
            </p>
          )}
        </>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "mt-4 w-full rounded-sm py-3 font-mono text-[13px] font-bold tracking-wide text-[#0A0A0A]",
          side === "buy" ? "bg-signal" : "bg-noise",
          !canSubmit && "cursor-not-allowed opacity-40",
        )}
      >
        {detail.complete
          ? "CURVE COMPLETE"
          : connected
            ? `${side.toUpperCase()} $${symbol}`
            : "CONNECT TO TRADE"}
      </button>

      <p className="mt-2 text-center font-mono text-[10px] leading-relaxed text-[#4b5563]">
        Conviction curve · {duration(detail.lockPeriodSeconds)} lock · {penaltyPct}% early exit
      </p>

      {tx && (
        <div className="mt-3">
          <TxStatus
            state={tx}
            title={
              tx === "pending"
                ? "Confirming…"
                : tx === "failed"
                  ? "Transaction failed"
                  : side === "buy"
                    ? "Position opened"
                    : "Position reduced"
            }
            detail={tx === "failed" && txErr ? txErr.slice(0, 90) : `$${symbol} · conviction`}
            signature={txSig ?? undefined}
            explorerUrl={txSig ? explorerTx(txSig) : undefined}
          />
        </div>
      )}

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
