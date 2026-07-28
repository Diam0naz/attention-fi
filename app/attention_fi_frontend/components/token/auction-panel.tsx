"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchAuctionDetail, fetchGlobal, type AuctionDetail } from "@/lib/solana/curve";
import { bidAuction, quoteBid, settleAuction } from "@/lib/solana/trade";
import { explorerTx } from "@/lib/solana/config";

/**
 * Dutch-auction trade panel.
 *
 * Deliberately not the buy/sell panel with different labels: an auction has no
 * sell side, its price falls on a clock rather than with demand, and a bid is
 * capped by a max price rather than guarded by slippage. Showing BUY/SELL tabs
 * here would misdescribe what the transaction does.
 */

const POLL_MS = 5_000;

function countdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "ended";
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = Math.floor(secondsLeft % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function AuctionPanel({ mint, symbol }: { mint: string; symbol: string }) {
  const { connected, address } = useWallet();
  const program = useProgram();
  const readonly = useReadonlyProgram();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ totalSol: number; feeSol: number } | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  // Stable across renders so the polling/quote effects key off the value,
  // not a fresh object identity each paint.
  const mintKey = useMemo(() => (mint ? new PublicKey(mint) : null), [mint]);

  const load = useCallback(async () => {
    if (!mintKey) return null;
    const global = await fetchGlobal(readonly);
    return fetchAuctionDetail(readonly, mintKey, global?.tokenDecimals ?? 6);
  }, [readonly, mintKey]);

  // Poll auction state; the price descends continuously so a stale panel would
  // quote above the chain and get rejected by the max-price guard.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = await load().catch(() => null);
      if (!cancelled) setAuction(a);
    })();
    const id = setInterval(() => {
      void load()
        .then((a) => {
          if (!cancelled && a) setAuction(a);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  // Local clock so the price and countdown move between polls.
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Re-quote as the amount changes; the chain rounds cost UP, so quoting
  // locally would under-report what gets charged.
  useEffect(() => {
    const amt = Number(amount);
    let cancelled = false;
    void (async () => {
      if (!mintKey || !Number.isFinite(amt) || amt <= 0) {
        if (!cancelled) setQuote(null);
        return;
      }
      const q = await quoteBid(readonly, mintKey, amt).catch(() => null);
      if (!cancelled && q) setQuote({ totalSol: q.totalSol, feeSol: q.feeSol });
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, readonly, mintKey]);

  const secondsLeft = auction ? auction.endTime - now : 0;
  const ended = auction ? secondsLeft <= 0 || auction.complete : false;
  // Interpolate the descent locally between polls.
  const livePriceSol = (() => {
    if (!auction) return 0;
    const { startPriceLamports, floorPriceLamports, startTime, duration } = auction;
    if (duration <= 0) return auction.priceSol;
    const elapsed = Math.min(Math.max(now - startTime, 0), duration);
    const span = Number(startPriceLamports - floorPriceLamports);
    return (Number(startPriceLamports) - (span * elapsed) / duration) / 1_000_000_000;
  })();

  async function submit() {
    if (!program || !address || !mintKey) return setWalletOpen(true);
    setTxErr(null);
    setTx("pending");
    try {
      const signer = new PublicKey(address);
      const sig = ended
        ? await settleAuction(program, signer, mintKey)
        : await bidAuction(program, signer, mintKey, Number(amount), livePriceSol);
      setTxSig(sig);
      setTx("confirmed");
      setAmount("");
      setAuction(await load().catch(() => auction));
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transaction failed");
      setTx("failed");
    }
  }

  if (!auction) {
    return (
      <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 font-mono text-[11px] text-[#6B6B6B]">
        Loading auction…
      </div>
    );
  }

  const canBid = !ended && Number(amount) > 0 && auction.remaining > 0n;
  const soldOut = auction.remaining === 0n;

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          Dutch auction
        </span>
        <span
          className={cn(
            "font-mono text-[10px]",
            ended ? "text-[#6B6B6B]" : "text-signal",
          )}
        >
          {auction.complete ? "settled" : countdown(secondsLeft)}
        </span>
      </div>

      {/* descending price — the defining mechanic, so it leads */}
      <div className="mt-3">
        <div className="font-mono text-[24px] font-bold tabular-nums">
          {livePriceSol.toFixed(9)} <span className="text-[12px] text-[#6B6B6B]">SOL</span>
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
          CURRENT PRICE · falls to {(Number(auction.floorPriceLamports) / 1e9).toFixed(9)}
        </div>
      </div>

      {/* allocation */}
      <div className="mt-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full bg-signal transition-[width] duration-500"
            style={{ width: `${Math.min(100, auction.soldPct)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
          <span>{auction.soldPct.toFixed(1)}% sold</span>
          <span>
            {auction.remainingTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} left
          </span>
        </div>
      </div>

      {!ended && !soldOut && (
        <>
          <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Amount ({symbol})
          </label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0"
            className="mt-1 w-full rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[13px] outline-none focus:border-signal/50"
          />

          <div className="mt-2.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>Total cost</span>
            <span className="text-[#F5F4F0]">
              {quote ? `${quote.totalSol.toFixed(6)} SOL` : "—"}
            </span>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
            <span>Max price / token</span>
            <span className="text-[#F5F4F0]">{livePriceSol.toFixed(9)}</span>
          </div>
        </>
      )}

      <button
        onClick={submit}
        disabled={!ended && !canBid}
        className={cn(
          "mt-4 w-full rounded-sm py-3 font-mono text-[13px] font-bold tracking-wide text-[#0A0A0A]",
          ended ? "bg-[#6B6B6B]" : "bg-signal",
          !ended && !canBid && "cursor-not-allowed opacity-40",
        )}
      >
        {auction.complete
          ? "AUCTION SETTLED"
          : ended
            ? "SETTLE AUCTION"
            : soldOut
              ? "SOLD OUT"
              : connected
                ? `BID FOR $${symbol}`
                : "CONNECT TO BID"}
      </button>

      <p className="mt-2 text-center font-mono text-[10px] leading-relaxed text-[#4b5563]">
        {ended
          ? "Settling is permissionless and finalizes the auction."
          : "Price descends until the allocation fills. Your bid is capped at the price shown."}
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
                  : ended
                    ? "Auction settled"
                    : "Bid filled"
            }
            detail={tx === "failed" && txErr ? txErr.slice(0, 90) : `$${symbol} · Dutch auction`}
            signature={txSig ?? undefined}
            explorerUrl={txSig ? explorerTx(txSig) : undefined}
          />
        </div>
      )}

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
