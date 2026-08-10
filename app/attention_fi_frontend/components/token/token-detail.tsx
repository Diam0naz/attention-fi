"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { type TokenDetail } from "@/lib/mock-data";
import { X_URL } from "@/lib/config";
import { PriceChart } from "@/components/token/price-chart";
import { MindshareView } from "@/components/token/mindshare-view";
import { OnchainMindshare } from "@/components/token/onchain-mindshare";
import { RiskDisclaimer } from "@/components/ui/risk-disclaimer";
import { DisavowBanner } from "@/components/token/disavow-banner";
import { Avatar } from "@/components/feed/avatar";
import { Footer } from "@/components/feed/footer";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useLiveTokenDetail } from "@/components/token/use-live-token";
import { MindshareSourceBadge } from "@/components/feed/mindshare-source";
import { AuctionPanel } from "@/components/token/auction-panel";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Notice } from "@/components/ui/notice";
import { ConvictionPanel } from "@/components/token/conviction-panel";
import { RevenuePanel } from "@/components/token/revenue-panel";
import { useTokenIndex } from "@/lib/token-index";
import { useProgram } from "@/lib/solana/use-program";
import { useSolBalance } from "@/lib/solana/use-sol-balance";
import { useSolUsd } from "@/lib/solana/sol-usd";
import { useTokenBalance } from "@/lib/solana/use-token-balance";
import { handleToMint } from "@/lib/solana/registry";
import { useVenue } from "@/lib/solana/use-venue";
import { useTokenHolders, useTokenTrades } from "@/lib/solana/use-token-activity";
import {
  graduateToken,
  graduationOutlook,
  tradeOnVenue,
  venueQuote,
  venueSpot,
} from "@/lib/solana/venue";
import { explorerTx } from "@/lib/solana/config";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";

const TABS = ["chart", "trades", "holders", "about"] as const;
type Tab = (typeof TABS)[number];

/** Compact "how long ago", from a block time. Null block times read as "—". */
function sinceLabel(blockTime: number | null): string {
  if (!blockTime) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - blockTime);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function TokenDetailTerminal({ token: tokenProp }: { token: TokenDetail }) {
  // Mock now, upgraded to live on-chain curve state when the token is deployed.
  const { token, source, refresh } = useLiveTokenDetail(tokenProp);
  const { connected, address } = useWallet();
  const program = useProgram();
  const solBalance = useSolBalance();
  const solUsdRate = useSolUsd();
  const mintKey = handleToMint(token.handle);
  const tokenMint = mintKey?.toBase58() ?? "";
  // Which venue is live decides both the quote and where the order goes.
  const {
    venue,
    decimals: venueDecimals,
    feeBps,
    graduationLamports,
    refresh: refreshVenue,
  } = useVenue(mintKey);
  // How many of THIS token the wallet holds (null when none / unregistered).
  const heldTokens = useTokenBalance(tokenMint);
  // Real wallet SOL when connected; mock as a preview fallback.
  const walletSol = solBalance ?? token.balanceSol;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chart");
  // 1a "Trading Terminal" (data-dense) vs 1b "Mindshare-First" (social proof).
  const [view, setView] = useState<"terminal" | "mindshare">("terminal");

  // Take mindshare from the shared index rather than the static catalog, so the
  // number and its measured/simulated label always describe the same thing.
  const { tokens: indexed } = useTokenIndex();
  const indexEntry = useMemo(
    () => indexed.find((t) => t.handle.toLowerCase() === token.handle.toLowerCase()),
    [indexed, token.handle],
  );
  const mindshareValue = indexEntry?.mindshare ?? token.mindshare;

  // Real activity, from the indexer and the token's own accounts. Both used to
  // be generated from a hash of the handle — stable across reloads, plausibly
  // shaped, and describing nothing.
  const { trades, tradesUnavailable, loaded: tradesLoaded } = useTokenTrades(tokenMint);
  const {
    holders,
    truncated: holdersTruncated,
    loaded: holdersLoaded,
  } = useTokenHolders(tokenMint, { creator: venue?.curve?.creator ?? null, viewer: address });

  const up = token.delta24h >= 0;
  // Mock fallback for catalog tokens that aren't on-chain; the live figure
  // below comes from the curve's own reserves once a venue resolves.
  const gradPct = Math.min(100, Math.round((token.raisedUsd / token.targetUsd) * 100));
  // Every mechanism now has its own panel, so this one is only ever reached for
  // a bonding curve (or a catalog token that isn't launched yet) — it
  // implements the constant-product buy/sell and nothing else.
  const MECH_LABEL: Record<NonNullable<TokenDetail["mechanism"]>, string> = {
    bonding: "Bonding curve · constant-product",
    conviction: "Conviction curve · time-locked",
    dutch: "Dutch auction · descending price",
    revenue: "Revenue share · fixed price",
  };
  const mechLabel = token.mechanism ? MECH_LABEL[token.mechanism] : MECH_LABEL.bonding;
  const amt = parseFloat(amount) || 0;
  // Quote from the venue that will actually fill the order. The market-cap
  // estimate below is the fallback for catalog tokens that aren't on-chain at
  // all; using it for a live token would price a trade against a number derived
  // from a different source than the one executing it.
  const fallbackPriceSol = token.marketCap / solUsdRate / 1_000_000_000;
  const receive = venue
    ? venueQuote(venue, side, amt, venueDecimals, feeBps)
    : side === "buy"
      ? fallbackPriceSol > 0
        ? amt / fallbackPriceSol
        : 0
      : amt * fallbackPriceSol;
  // Between completion and migration the token trades nowhere — the curve
  // refuses and the pool doesn't exist yet.
  const stranded = venue?.kind === "stranded";
  // Whether *this* buy would graduate the token. Checked before the trade
  // rather than reported after, because crossing the line can't be undone.
  const outlook =
    venue && graduationLamports > 0n
      ? graduationOutlook(venue, side === "buy" ? amt : 0, graduationLamports, feeBps)
      : null;
  const wouldGraduate = side === "buy" && !stranded && outlook?.crosses === true;
  // Balance for the active side: SOL when buying, token holdings when selling.
  const sideBalance = side === "buy" ? walletSol : heldTokens ?? 0;
  const balLoading = connected && (side === "buy" ? solBalance == null : heldTokens == null);

  async function submit() {
    if (!connected) return setWalletOpen(true);
    if (amt <= 0) return;

    const mint = handleToMint(token.handle);
    setTx("pending");
    setTxSig(null);
    setTxErr(null);

    // Mock path for tokens that aren't on-chain (or no signer available).
    if (!program || !mint || !address) {
      setTimeout(() => setTx("confirmed"), 1600);
      return;
    }

    try {
      const wallet = new PublicKey(address);
      const sig = await tradeOnVenue(program, wallet, mint, side, amt, venueDecimals);
      setTxSig(sig);
      setTx("confirmed");
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : String(e));
      setTx("failed");
    }
  }

  /**
   * Run the curve→pool migration. Exposed to anyone, not just the creator: the
   * curve stops trading the moment it completes, so gating this on the creator
   * showing up would strand every holder until they did.
   */
  async function migrate() {
    if (!connected) return setWalletOpen(true);
    const mint = handleToMint(token.handle);
    if (!program || !mint || !address) return;
    setTx("pending");
    setTxSig(null);
    setTxErr(null);
    try {
      const sig = await graduateToken(program, new PublicKey(address), mint);
      setTxSig(sig);
      setTx("confirmed");
      refreshVenue();
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : String(e));
      setTx("failed");
    }
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
          <RefreshButton onRefresh={refresh} label="" />
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide",
              source === "onchain"
                ? "bg-signal/15 text-signal"
                : "border border-white/10 text-[#6B6B6B]",
            )}
            title={source === "onchain" ? "Live on-chain data" : "Preview — mock data until the token is on-chain"}
          >
            {source === "onchain" ? "● LIVE" : "PREVIEW"}
          </span>
          <Link
            href={`/terminal?symbol=${token.handle}`}
            title="Open in the pro terminal: full chart, indicators, order book"
            className="hidden items-center gap-1 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] font-bold text-[#9aa4af] transition-colors hover:border-signal/40 hover:text-signal sm:inline-flex"
          >
            TERMINAL ↗
          </Link>
          <span className="hidden font-mono text-[10px] text-[#6B6B6B] sm:inline">
            SOL/USD ${solUsdRate.toFixed(2)}
          </span>
          {/* No wallet control here. The global nav carries the address and the
              disconnect menu one row above, and repeating them put two copies
              of the same state on screen — which on a phone pushed this row
              wide enough to overflow. The trade panel still opens the connect
              modal on demand, so nothing is lost by not restating it. */}
        </div>
      </nav>

      <div className="grid flex-1 lg:grid-cols-[1fr_380px]">
        {/* left: chart + info */}
        <div className="border-white/[0.08] p-5 sm:p-7 lg:border-r">
          {/* Before anything about price. A raw TokenDisavowed at the moment of
              signing is the worst place to learn this. */}
          <DisavowBanner mint={handleToMint(token.handle)?.toBase58() ?? null} />

          {/* Graduation status, live from the curve where there is one. The
              three states are genuinely different and used to collapse into
              one optimistic banner. */}
          {venue?.kind === "pool" ? (
            <div className="mb-4 flex items-center gap-3 rounded-sm border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5">
              <span className="text-[14px]">🎓</span>
              <span className="flex-1 text-[12px]">
                ${token.symbol} has graduated. It trades on its own AMM pool now
                — the bonding curve is closed for good.
              </span>
            </div>
          ) : stranded ? (
            <div className="mb-4 flex items-center gap-3 rounded-sm border border-noise/40 bg-noise/[0.07] px-3.5 py-2.5">
              <span className="text-[14px]">⏳</span>
              <span className="flex-1 text-[12px]">
                ${token.symbol} graduated but hasn&apos;t been migrated yet, so
                it can&apos;t be traded at all until someone runs it. Anyone
                can — the panel on the right has the button.
              </span>
            </div>
          ) : (outlook ? outlook.progress < 1 : gradPct < 100) ? (
            <div className="mb-4 flex items-center gap-3 rounded-sm border border-signal/30 bg-signal/[0.07] px-3.5 py-2.5">
              <span className="text-[14px]">🎓</span>
              <span className="flex-1 text-[12px]">
                ${token.symbol} is{" "}
                <span className="font-bold text-signal">
                  {outlook ? Math.round(outlook.progress * 100) : gradPct}% to graduation
                </span>
                .{" "}
                {outlook
                  ? `Another ${outlook.remainingSol.toFixed(2)} SOL of buying completes the curve and closes it permanently.`
                  : "The next buys migrate liquidity to a native AMM."}
              </span>
              <span className="whitespace-nowrap font-mono text-[10px] text-signal">
                {outlook
                  ? `${outlook.reservesSol.toFixed(1)} / ${outlook.thresholdSol.toFixed(0)} SOL`
                  : `${usd(token.raisedUsd)} / ${usd(token.targetUsd)}`}
              </span>
            </div>
          ) : null}

          {/* header */}
          <div className="flex items-center gap-3">
            <Avatar handle={token.handle} image={token.image} className="h-12 w-12" />
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
              <div className="font-mono text-[24px] font-bold sm:text-[26px]">{mindshareValue.toFixed(2)}%</div>
              <div className="font-mono text-[10px] text-[#6B6B6B]">MINDSHARE · RANK #{token.rank}</div>
              <MindshareSourceBadge source={indexEntry?.mindshareSource} className="mt-1" />
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

          {/* Directly under the price, which is where the checklist asks for it
              and the only place it does any work: the argument it makes — that
              nothing here promises a return — is worth nothing at the bottom of
              a page the buyer never scrolls to. */}
          <RiskDisclaimer className="mt-4 max-w-2xl" />

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
            <div className="mt-4 flex flex-col gap-4">
              {/* What the chain knows, beside what the app measures. They
                  disagree by design — the app's figure is live, the chain's was
                  written by whoever last cranked the oracle — and only the
                  latter is something the protocol could act on. */}
              <OnchainMindshare mint={handleToMint(token.handle)?.toBase58() ?? null} />
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
                <PriceChart handle={token.handle} marketCap={token.marketCap} mint={tokenMint || undefined} />
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
                {!tradesLoaded ? (
                  <div className="px-3 py-8 text-center font-mono text-[11px] text-[#6B6B6B]">
                    Reading recent trades…
                  </div>
                ) : trades.length === 0 ? (
                  // "No trades yet" and "we can't see trades" are different
                  // facts, and one blank panel for both turns a deployment
                  // problem into an apparently dead market.
                  <div className="px-3 py-8 text-center font-mono text-[11px] leading-relaxed text-[#6B6B6B]">
                    {tradesUnavailable
                      ? "Trade history isn't available — no indexer is configured for this deployment."
                      : "No trades yet. Be the first."}
                  </div>
                ) : (
                  trades.map((tr) => (
                    <a
                      key={tr.signature}
                      href={explorerTx(tr.signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="grid grid-cols-[64px_1fr_1fr_72px] items-center gap-2 border-t border-white/[0.05] px-3 py-2 font-mono text-[11px] transition-colors hover:bg-white/[0.02]"
                    >
                      <span className={cn("font-bold uppercase", tr.side === "buy" ? "text-signal" : "text-noise")}>
                        {tr.side}
                        {/* Which venue filled it. After graduation these are
                            the same market to a trader but a different
                            instruction on-chain. */}
                        {tr.onPool && <span className="ml-1 text-[8px] text-[#6B6B6B]">AMM</span>}
                      </span>
                      <span className="text-right text-[#F5F4F0]">{tr.sol.toFixed(3)}</span>
                      <span className="text-right text-[#6B6B6B]">
                        {tr.wallet ? `${tr.wallet.slice(0, 4)}…${tr.wallet.slice(-4)}` : "—"}
                      </span>
                      <span className="text-right text-[#6B6B6B]">{sinceLabel(tr.blockTime)}</span>
                    </a>
                  ))
                )}
              </div>
            )}

            {tab === "holders" && (
              <div className="overflow-hidden rounded-sm border border-white/[0.06]">
                {!holdersLoaded ? (
                  <div className="px-3 py-8 text-center font-mono text-[11px] text-[#6B6B6B]">
                    Reading token accounts…
                  </div>
                ) : holders.length === 0 ? (
                  <div className="px-3 py-8 text-center font-mono text-[11px] text-[#6B6B6B]">
                    Nobody holds this token yet.
                  </div>
                ) : (
                  <>
                {holders.map((h) => (
                  <div
                    key={h.wallet}
                    className="flex items-center gap-3 border-t border-white/[0.05] px-3 py-2.5 first:border-t-0 font-mono text-[11px]"
                  >
                    <span className="w-6 text-[#4b5563]">{h.rank}</span>
                    <span className="flex items-center gap-2 text-[#F5F4F0]">
                      {h.tag === "curve" || h.tag === "pool" || h.tag === "others"
                        ? h.wallet
                        : `${h.wallet.slice(0, 4)}…${h.wallet.slice(-4)}`}
                      {h.tag === "curve" && (
                        <span className="rounded-sm border border-pulse/40 px-1.5 py-0.5 text-[8px] text-pulse">CURVE</span>
                      )}
                      {h.tag === "pool" && (
                        <span className="rounded-sm border border-pulse/40 px-1.5 py-0.5 text-[8px] text-pulse">AMM</span>
                      )}
                      {h.tag === "creator" && (
                        <span className="rounded-sm border border-signal/40 px-1.5 py-0.5 text-[8px] text-signal">CREATOR</span>
                      )}
                      {h.tag === "you" && (
                        <span className="rounded-sm border border-signal/40 px-1.5 py-0.5 text-[8px] text-signal">YOU</span>
                      )}
                    </span>
                    <div className="ml-auto flex w-32 items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-signal/70" style={{ width: `${Math.min(100, h.pct)}%` }} />
                      </div>
                      <span className="w-10 text-right text-[#9aa4af]">{h.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {/* The RPC returns the top 20 accounts, so past that we know
                    the remaining supply but not how many wallets hold it.
                    Saying so beats inventing a holder count, which is exactly
                    what the mock's "+2,431 others" did. */}
                {holdersTruncated && (
                  <p className="border-t border-white/[0.05] px-3 py-2 font-mono text-[9px] text-[#4b5563]">
                    Top 20 accounts shown; the rest is aggregated.
                  </p>
                )}
                  </>
                )}
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

        {/* right: order panel — a Dutch auction gets its own controls rather
            than buy/sell tabs, which would misdescribe what it does. */}
        <div className="p-5 sm:p-7">
          {token.mechanism === "dutch" ? (
            <AuctionPanel mint={tokenMint} symbol={token.symbol} />
          ) : token.mechanism === "conviction" ? (
            <ConvictionPanel mint={tokenMint} symbol={token.symbol} />
          ) : token.mechanism === "revenue" ? (
            <RevenuePanel mint={tokenMint} symbol={token.symbol} />
          ) : (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
            {/* A token that has completed but not migrated trades nowhere. The
                buy/sell controls stay visible but disabled, because hiding them
                would read as "this token is gone" rather than "one step is
                outstanding, and you can take it". */}
            {stranded && (
              <div className="mb-3">
                <Notice tone="caution" title="Awaiting migration">
                  ${token.symbol} hit its graduation threshold, so the bonding
                  curve has stopped trading — and its AMM pool hasn&apos;t been
                  created yet, so nothing has picked it up. Until the migration
                  runs it can&apos;t be bought or sold. Anyone can run it: it
                  moves the curve&apos;s SOL and remaining tokens into the pool,
                  takes no cut, and doesn&apos;t need the creator.
                </Notice>
                <button
                  onClick={migrate}
                  className="mt-2 w-full rounded-sm bg-signal py-2 font-mono text-[11px] font-bold tracking-wide text-[#0A0A0A]"
                >
                  {connected ? "RUN MIGRATION" : "CONNECT TO MIGRATE"}
                </button>
              </div>
            )}

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
                <span>
                  BAL:{" "}
                  {balLoading
                    ? "…"
                    : side === "buy"
                      ? `${walletSol.toFixed(2)} SOL`
                      : `${sideBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${token.symbol}`}
                </span>
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
                    onClick={() => {
                      const frac = q === "MAX" ? 1 : parseInt(q) / 100;
                      setAmount(
                        side === "buy"
                          ? (sideBalance * frac).toFixed(3)
                          : String(Math.floor(sideBalance * frac)),
                      );
                    }}
                    className="rounded-sm border border-white/10 px-2 py-1 font-mono text-[9px] text-[#9aa4af] hover:border-white/20"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Spot from the venue that will fill the order. Shown next to the
                estimate so the gap between them — the cost of size — is legible
                rather than something the trader has to work out. */}
            {venue && (
              <div className="mt-2.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
                <span>Spot</span>
                <span className="text-[#F5F4F0]">
                  {venueSpot(venue, venueDecimals).toPrecision(4)} SOL
                </span>
              </div>
            )}
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
              <span>You receive</span>
              <span className="text-[#F5F4F0]">
                ≈ {receive.toLocaleString(undefined, { maximumFractionDigits: side === "buy" ? 0 : 4 })}{" "}
                {side === "buy" ? token.symbol : "SOL"}
              </span>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
              <span>Slippage</span>
              <span className="text-[#F5F4F0]">1.0%</span>
            </div>

            {/* Live progress toward graduation, from the curve's own real
                reserves — the same number the program tests. */}
            {outlook && !stranded && (
              <div className="mt-2.5">
                <div className="flex justify-between font-mono text-[10px] text-[#6B6B6B]">
                  <span>To graduation</span>
                  <span className="text-[#F5F4F0]">
                    {outlook.reservesSol.toFixed(2)} / {outlook.thresholdSol.toFixed(0)} SOL
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={cn("h-full rounded-full", wouldGraduate ? "bg-noise" : "bg-signal")}
                    style={{ width: `${Math.round(outlook.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Shown before the trade, not after. Crossing the threshold ends
                trading on the curve inside the same instruction that crosses
                it, and nothing can move a curve back under the line. */}
            {wouldGraduate && (
              <div className="mt-3">
                <Notice tone="danger" title="This buy would graduate the token">
                  It takes the curve past {outlook!.thresholdSol.toFixed(0)} SOL, which
                  completes it. The bonding curve stops accepting trades
                  immediately — including sells — and stays closed until someone
                  runs the migration into the AMM pool. That step is
                  permissionless, so you could run it yourself straight after.
                  There is no way back to the curve afterwards. Buying{" "}
                  {outlook!.remainingSol > 0.001
                    ? `under ${outlook!.remainingSol.toFixed(3)} SOL`
                    : "less"}{" "}
                  keeps it trading as it is.
                </Notice>
              </div>
            )}

            <button
              onClick={submit}
              disabled={stranded}
              className={cn(
                "mt-4 w-full rounded-sm py-3 font-mono text-[13px] font-bold tracking-wide text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40",
                side === "buy" ? "bg-signal" : "bg-noise",
              )}
            >
              {stranded
                ? "MIGRATION REQUIRED"
                : !connected
                  ? "CONNECT TO TRADE"
                  : wouldGraduate
                    ? // Naming the consequence on the button itself, so it's
                      // legible to someone who skims past the notice above.
                      `BUY & GRADUATE $${token.symbol}`
                    : `${side.toUpperCase()} $${token.symbol}`}
            </button>
            {/* Name the venue that will fill the order, not the one the token
                launched on — after graduation they're different. */}
            <div className="mt-2 text-center font-mono text-[10px] text-[#4b5563]">
              {venue?.kind === "pool" ? "Graduated · constant-product AMM pool" : mechLabel}
            </div>

            {tx && (
              <div className="mt-3">
                <TxStatus
                  onDismiss={() => setTx(null)}
                  state={tx}
                  title={
                    tx === "pending"
                      ? "Confirming trade…"
                      : tx === "confirmed"
                        ? "Trade confirmed"
                        : "Trade failed"
                  }
                  detail={
                    tx === "failed" && txErr
                      ? txErr.slice(0, 90)
                      : side === "buy"
                        ? `${amt} SOL → $${token.symbol}`
                        : `${amt} $${token.symbol} → SOL`
                  }
                  signature={txSig ? `${txSig.slice(0, 4)}…${txSig.slice(-4)}` : undefined}
                  explorerUrl={txSig ? explorerTx(txSig) : undefined}
                  onRetry={submit}
                />
              </div>
            )}

            {/* stats */}
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-4">
              {[
                // Real count once the accounts are read; the catalog figure is
                // the fallback for tokens that aren't on-chain at all.
                {
                  k: "HOLDERS",
                  v: holdersLoaded && holders.length > 0
                    ? `${holders.filter((h) => h.tag !== "curve" && h.tag !== "pool" && h.tag !== "others").length}${holdersTruncated ? "+" : ""}`
                    : holdersLoaded
                      ? "0"
                      : String(token.holders),
                },
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
          )}
        </div>
      </div>

      <Footer />

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
