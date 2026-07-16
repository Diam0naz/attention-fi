"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHolders, getTrades, type TokenDetail } from "@/lib/mock-data";
import { X_URL } from "@/lib/config";
import { PriceChart } from "@/components/token/price-chart";
import { MindshareView } from "@/components/token/mindshare-view";
import { Footer } from "@/components/feed/footer";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";

const TABS = ["chart", "trades", "holders", "about"] as const;
type Tab = (typeof TABS)[number];

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function TokenDetailTerminal({ token }: { token: TokenDetail }) {
  const { connected, shortAddress, disconnect } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);
  const [tab, setTab] = useState<Tab>("chart");
  // 1a "Trading Terminal" (data-dense) vs 1b "Mindshare-First" (social proof).
  const [view, setView] = useState<"terminal" | "mindshare">("terminal");

  const trades = useMemo(() => getTrades(token.handle), [token.handle]);
  const holders = useMemo(() => getHolders(token.handle), [token.handle]);

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
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#F5F4F0]">
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
          {connected ? (
            <div className="flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/[0.06] px-1 py-0.5">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] font-bold text-signal">
                <span className="h-1.5 w-1.5 rounded-full bg-signal af-pulse-dot" />
                {shortAddress}
              </span>
              <button
                onClick={disconnect}
                className="rounded-sm px-2 py-1 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-noise"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setWalletOpen(true)}
              className="rounded-sm bg-signal px-3.5 py-1.5 font-mono text-[11px] font-bold tracking-wide text-[#0A0A0A]"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      <div className="grid flex-1 lg:grid-cols-[1fr_380px]">
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

          {/* view toggle — 1a data-dense terminal vs 1b mindshare-first */}
          <div className="mt-4 inline-flex rounded-sm border border-white/10 p-0.5">
            {(["terminal", "mindshare"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-sm px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors",
                  view === v ? "bg-signal text-[#0A0A0A]" : "text-[#6B6B6B] hover:text-[#F5F4F0]",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {view === "mindshare" && (
            <div className="mt-4">
              <MindshareView token={token} />
            </div>
          )}

          {view === "terminal" && (
            <>
          {/* tabs */}
          <div className="mt-4 flex gap-5 border-b border-white/[0.08] pb-2.5 font-mono text-[11px]">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "pb-[9px] uppercase transition-colors",
                  tab === t
                    ? "border-b-2 border-signal text-signal"
                    : "text-[#6B6B6B] hover:text-[#F5F4F0]",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* tab content */}
          <div className="mt-4">
            {tab === "chart" && (
              <div className="overflow-hidden rounded-sm border border-white/[0.06] bg-black">
                <PriceChart handle={token.handle} marketCap={token.marketCap} />
              </div>
            )}

            {tab === "trades" && (
              <div className="overflow-hidden rounded-sm border border-white/[0.06]">
                <div className="grid grid-cols-[64px_1fr_1fr_72px] gap-2 bg-white/[0.03] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
                  <span>Side</span>
                  <span className="text-right">SOL</span>
                  <span className="text-right">Wallet</span>
                  <span className="text-right">Time</span>
                </div>
                {trades.map((tr, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[64px_1fr_1fr_72px] items-center gap-2 border-t border-white/[0.05] px-3 py-2 font-mono text-[11px]"
                  >
                    <span className={cn("font-bold uppercase", tr.side === "buy" ? "text-signal" : "text-noise")}>
                      {tr.side}
                    </span>
                    <span className="text-right text-[#F5F4F0]">{tr.sol.toFixed(2)}</span>
                    <span className="text-right text-[#6B6B6B]">{tr.wallet}</span>
                    <span className="text-right text-[#6B6B6B]">{tr.ago}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "holders" && (
              <div className="overflow-hidden rounded-sm border border-white/[0.06]">
                {holders.map((h) => (
                  <div
                    key={h.rank}
                    className="flex items-center gap-3 border-t border-white/[0.05] px-3 py-2.5 first:border-t-0 font-mono text-[11px]"
                  >
                    <span className="w-6 text-[#4b5563]">{h.rank}</span>
                    <span className="flex items-center gap-2 text-[#F5F4F0]">
                      {h.wallet}
                      {h.tag === "curve" && (
                        <span className="rounded-sm border border-pulse/40 px-1.5 py-0.5 text-[8px] text-pulse">CURVE</span>
                      )}
                      {h.tag === "creator" && (
                        <span className="rounded-sm border border-signal/40 px-1.5 py-0.5 text-[8px] text-signal">CREATOR</span>
                      )}
                    </span>
                    <div className="ml-auto flex w-32 items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-signal/70" style={{ width: `${Math.min(100, h.pct)}%` }} />
                      </div>
                      <span className="w-10 text-right text-[#9aa4af]">{h.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "about" && (
              <div className="rounded-sm border border-white/[0.06] bg-[#0f1620] p-5">
                <p className="text-[13px] leading-relaxed text-[#9aa4af]">
                  <span className="font-bold text-[#F5F4F0]">${token.symbol}</span> tokenises the
                  mindshare of <span className="text-[#F5F4F0]">@{token.handle}</span> — a tradeable
                  claim on their share of the {token.vertical} conversation. Price is seeded from a
                  live mindshare oracle and follows a constant-product bonding curve until it
                  graduates to a native AMM at $69K.
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 font-mono text-[12px]">
                  {[
                    ["Symbol", `$${token.symbol}`],
                    ["Vertical", token.vertical],
                    ["Mechanism", "Bonding curve"],
                    ["Total supply", "1,000,000,000"],
                    ["Graduation", usd(token.targetUsd)],
                    ["Creator fee", `${(token.creatorFeeBps / 100).toFixed(1)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-white/[0.06] pb-2">
                      <span className="text-[#6B6B6B]">{k}</span>
                      <span className="text-[#F5F4F0]">{v}</span>
                    </div>
                  ))}
                </dl>
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-signal hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> @{token.handle} on X
                </a>
              </div>
            )}
          </div>
            </>
          )}
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

      <Footer />

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
