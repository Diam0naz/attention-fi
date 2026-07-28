"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchGlobal, fetchRevenueDetail, type RevenueDetail } from "@/lib/solana/curve";
import { buyRevenue, claimRevenue } from "@/lib/solana/trade";
import { explorerTx } from "@/lib/solana/config";

/**
 * Revenue-share trade panel.
 *
 * Deliberately not buy/sell tabs: shares sell at a fixed price from a finite
 * allocation and there is no sell side — the return is the revenue stream, not
 * a price move. So the two actions are "buy shares" and "claim revenue".
 */

const POLL_MS = 8_000;

export function RevenuePanel({ mint, symbol }: { mint: string; symbol: string }) {
  const { connected, address } = useWallet();
  const program = useProgram();
  const readonly = useReadonlyProgram();

  const [detail, setDetail] = useState<RevenueDetail | null>(null);
  const [decimals, setDecimals] = useState(6);
  const [feeBps, setFeeBps] = useState(0);
  const [shares, setShares] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [action, setAction] = useState<"buy" | "claim">("buy");

  const mintKey = useMemo(() => (mint ? new PublicKey(mint) : null), [mint]);

  const load = useCallback(async () => {
    if (!mintKey) return null;
    const global = await fetchGlobal(readonly);
    const dec = global?.tokenDecimals ?? 6;
    setDecimals(dec);
    setFeeBps(global?.feeBps ?? 0);
    return fetchRevenueDetail(readonly, mintKey, dec, address ? new PublicKey(address) : null);
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
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [load]);

  async function submit(kind: "buy" | "claim") {
    if (!program || !address || !mintKey) return setWalletOpen(true);
    setAction(kind);
    setTxErr(null);
    setTx("pending");
    try {
      const signer = new PublicKey(address);
      const sig =
        kind === "buy"
          ? await buyRevenue(program, signer, mintKey, Number(shares), decimals)
          : await claimRevenue(program, signer, mintKey);
      setTxSig(sig);
      setTx("confirmed");
      if (kind === "buy") setShares("");
      setDetail(await load().catch(() => detail));
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transaction failed");
      setTx("failed");
    }
  }

  if (!detail) {
    return (
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 font-mono text-[11px] text-[#6B6B6B]">
        Loading revenue share…
      </div>
    );
  }

  const n = Number(shares);
  const validShares = Number.isFinite(n) && n > 0 && n <= detail.remainingShares;
  const cost = validShares ? n * detail.sharePriceSol : 0;
  const fee = cost * (feeBps / 10_000);
  const soldOut = detail.remainingBaseUnits === 0n;
  const claimable = detail.stake?.claimableSol ?? 0;

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          Revenue share
        </span>
        <span className="font-mono text-[10px] text-signal">
          {detail.revenueReservesSol.toFixed(4)} SOL distributed
        </span>
      </div>

      <div className="mt-3">
        <div className="font-mono text-[24px] font-bold tabular-nums">
          {detail.sharePriceSol.toFixed(6)} <span className="text-[12px] text-[#6B6B6B]">SOL</span>
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
          PER SHARE · fixed price
        </div>
      </div>

      <div className="mt-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full bg-signal transition-[width] duration-500"
            style={{ width: `${Math.min(100, detail.soldPct)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
          <span>{detail.soldPct.toFixed(1)}% sold</span>
          <span>
            {detail.remainingShares.toLocaleString(undefined, { maximumFractionDigits: 0 })} left
          </span>
        </div>
      </div>

      {/* the holder's stake and what it has earned */}
      {detail.stake && (
        <div className="mt-3 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2.5">
          <div className="flex justify-between font-mono text-[10px]">
            <span className="text-[#6B6B6B]">Your shares</span>
            <span className="text-[#F5F4F0]">
              {detail.stake.stakedShares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px]">
            <span className="text-[#6B6B6B]">Claimable</span>
            <span className={claimable > 0 ? "text-signal" : "text-[#6B6B6B]"}>
              {claimable.toFixed(6)} SOL
            </span>
          </div>
          <button
            onClick={() => submit("claim")}
            disabled={claimable <= 0 || tx === "pending"}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-sm border border-signal/40 bg-signal/10 py-2 font-mono text-[11px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Coins className="h-3 w-3" />
            {claimable > 0 ? "CLAIM REVENUE" : "NOTHING TO CLAIM"}
          </button>
        </div>
      )}

      {!soldOut && (
        <>
          <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Shares
          </label>
          <input
            inputMode="decimal"
            value={shares}
            onChange={(e) => setShares(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0"
            className="mt-1 w-full rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[13px] outline-none focus:border-signal/50"
          />
          <div className="mt-2.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>Cost</span>
            <span className="text-[#F5F4F0]">{cost > 0 ? `${cost.toFixed(6)} SOL` : "—"}</span>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>Protocol fee</span>
            <span>{cost > 0 ? `${fee.toFixed(6)} SOL` : "—"}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-white/[0.06] pt-1.5 font-mono text-[11px]">
            <span className="text-[#6B6B6B]">Total</span>
            <span className="font-bold text-[#F5F4F0]">
              {cost > 0 ? `${(cost + fee).toFixed(6)} SOL` : "—"}
            </span>
          </div>
          {n > detail.remainingShares && (
            <p className="mt-2 font-mono text-[10px] text-noise">
              Only {detail.remainingShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              shares remain.
            </p>
          )}
        </>
      )}

      <button
        onClick={() => submit("buy")}
        disabled={soldOut || !validShares}
        className={cn(
          "mt-4 w-full rounded-sm py-3 font-mono text-[13px] font-bold tracking-wide text-[#0A0A0A]",
          soldOut ? "bg-[#6B6B6B]" : "bg-signal",
          !soldOut && !validShares && "cursor-not-allowed opacity-40",
        )}
      >
        {soldOut ? "FULLY ALLOCATED" : connected ? `BUY $${symbol} SHARES` : "CONNECT TO BUY"}
      </button>

      <p className="mt-2 text-center font-mono text-[10px] leading-relaxed text-[#4b5563]">
        Shares earn a pro-rata cut of revenue the creator deposits. There&apos;s no sell side —
        the return is the stream, not a price move.
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
                  : action === "claim"
                    ? "Revenue claimed"
                    : "Shares bought"
            }
            detail={tx === "failed" && txErr ? txErr.slice(0, 90) : `$${symbol} · revenue share`}
            signature={txSig ?? undefined}
            explorerUrl={txSig ? explorerTx(txSig) : undefined}
          />
        </div>
      )}

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
