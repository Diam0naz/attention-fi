"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenDetail } from "@/lib/mock-data";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function TokenDetailTerminal({ token }: { token: TokenDetail }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [connected, setConnected] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);

  const up = token.delta24h >= 0;
  const gradPct = Math.min(100, Math.round((token.raisedUsd / token.targetUsd) * 100));
  const amt = parseFloat(amount) || 0;
  const receive = side === "buy" ? amt * 24_000 : amt; // mock rate

  function submit() {
    if (!connected) return setWalletOpen(true);
    if (amt <= 0) return;
    setTx("pending");
    setTimeout(() => setTx("confirmed"), 1600);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F4F0]">
      {/* top bar */}
      <nav className="flex items-center gap-4 border-b border-white/[0.08] px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono text-[11px]">Feed</span>
        </Link>
        <span className="text-[#4b5563]">/</span>
        <span className="font-mono text-[12px]">@{token.handle}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[10px] text-[#6B6B6B] sm:inline">SOL/USD $164.20</span>
          <button
            onClick={() => (connected ? undefined : setWalletOpen(true))}
            className="rounded-sm bg-signal px-3.5 py-1.5 font-mono text-[11px] font-bold tracking-wide text-[#0A0A0A]"
          >
            {connected ? "12.4 SOL" : "Connect Wallet"}
          </button>
        </div>
      </nav>

      <div className="grid lg:grid-cols-[1fr_380px]">
        {/* left: chart + info */}
        <div className="border-white/[0.08] p-5 sm:p-7 lg:border-r">
          {gradPct < 100 && (
            <div className="mb-4 flex items-center gap-3 rounded-sm border border-signal/30 bg-signal/[0.07] px-3.5 py-2.5">
              <span className="text-[14px]">🎓</span>
              <span className="flex-1 text-[12px]">
                Almost there — ${token.symbol} is{" "}
                <span className="font-bold text-signal">{gradPct}% to graduation</span>. The next buys
                migrate liquidity to a native AMM.
              </span>
              <span className="whitespace-nowrap font-mono text-[10px] text-signal">
                {usd(token.raisedUsd)} / {usd(token.targetUsd)}
              </span>
            </div>
          )}

          {/* header */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-[repeating-linear-gradient(45deg,#1c2733,#1c2733_4px,#222f3d_4px,#222f3d_8px)]" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[20px] font-bold">@{token.handle}</span>
                {token.verified && <BadgeCheck className="h-4 w-4 text-signal" />}
                <span className="rounded-full border border-white/20 px-2 py-0.5 font-mono text-[9px]">
                  {token.tier.toUpperCase()}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-[#6B6B6B]">
                {token.name} · {token.vertical}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono text-[24px] font-bold sm:text-[26px]">{token.mindshare.toFixed(2)}%</div>
              <div className="font-mono text-[10px] text-[#6B6B6B]">MINDSHARE · RANK #{token.rank}</div>
            </div>
          </div>

          {/* price */}
          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-mono text-[30px] font-bold sm:text-[34px]">{usd(token.marketCap)}</span>
            <span className={cn("font-mono text-[14px] font-bold", up ? "text-signal" : "text-noise")}>
              {up ? "+" : ""}
              {token.delta24h.toFixed(1)}% (24h)
            </span>
            <span className="text-[11px] text-[#6B6B6B]">market cap</span>
          </div>

          {/* tabs */}
          <div className="mt-4 flex gap-5 border-b border-white/[0.08] pb-2.5 font-mono text-[11px] text-[#6B6B6B]">
            <span className="border-b-2 border-signal pb-[9px] text-signal">CHART</span>
            <span>TRADES</span>
            <span>HOLDERS</span>
            <span>ABOUT</span>
          </div>

          {/* candlestick chart */}
          <div className="mt-4 flex h-[220px] items-end gap-1 rounded-sm border border-white/[0.06] bg-black p-4">
            {token.candles.map((c, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 border-t-2",
                  c.up ? "border-signal bg-[#12332a]" : "border-noise bg-[#2e1418]",
                )}
                style={{ height: `${c.h}%` }}
              />
            ))}
          </div>
        </div>

        {/* right: order panel */}
        <div className="p-5 sm:p-7">
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
            {/* buy/sell toggle */}
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

            {/* amount */}
            <div className="mt-3 rounded-sm border border-white/[0.08] bg-[#12181f] p-3">
              <div className="flex justify-between font-mono text-[10px] text-[#6B6B6B]">
                <span>AMOUNT</span>
                <span>BAL: {token.balanceSol} SOL</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="w-full bg-transparent font-mono text-[24px] font-bold outline-none placeholder:text-[#4b5563]"
                />
                <span className="text-[12px] text-[#6B6B6B]">{side === "buy" ? "SOL" : token.symbol}</span>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                {(["25%", "50%", "MAX"] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() =>
                      setAmount(
                        String(token.balanceSol * (q === "MAX" ? 1 : parseInt(q) / 100)),
                      )
                    }
                    className="rounded-sm border border-white/10 px-2 py-1 font-mono text-[9px] text-[#9aa4af] hover:border-white/20"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
              <span>You receive</span>
              <span className="text-[#F5F4F0]">
                ≈ {receive.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                {side === "buy" ? token.symbol : "SOL"}
              </span>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
              <span>Slippage</span>
              <span className="text-[#F5F4F0]">1.0%</span>
            </div>

            <button
              onClick={submit}
              className={cn(
                "mt-4 w-full rounded-sm py-3 font-mono text-[13px] font-bold tracking-wide text-[#0A0A0A]",
                side === "buy" ? "bg-signal" : "bg-noise",
              )}
            >
              {connected ? `${side.toUpperCase()} $${token.symbol}` : "CONNECT TO TRADE"}
            </button>
            <div className="mt-2 text-center font-mono text-[10px] text-[#4b5563]">
              Bonding curve · constant-product
            </div>

            {tx && (
              <div className="mt-3">
                <TxStatus
                  state={tx}
                  title={tx === "pending" ? "Confirming trade…" : "Trade confirmed"}
                  detail={`${amt} SOL → ${token.symbol}`}
                  signature="5xРq…8kQ2"
                  explorerUrl="#"
                  onRetry={() => setTx("pending")}
                />
              </div>
            )}

            {/* stats */}
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-4">
              {[
                { k: "HOLDERS", v: String(token.holders) },
                { k: "LIQUIDITY", v: usd(token.liquidityUsd) },
                { k: "VIRTUAL RESERVES", v: `${token.virtualSol} SOL` },
                { k: "CREATOR FEE", v: `${(token.creatorFeeBps / 100).toFixed(1)}%`, ok: token.verified },
              ].map((s) => (
                <div key={s.k}>
                  <div className="font-mono text-[9px] text-[#6B6B6B]">{s.k}</div>
                  <div className={cn("mt-0.5 font-mono text-[14px]", s.ok && "text-signal")}>
                    {s.v}
                    {s.ok ? " ✓ verified" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <WalletConnectModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onSelect={() => {
          setConnected(true);
          setWalletOpen(false);
        }}
      />
    </div>
  );
}
