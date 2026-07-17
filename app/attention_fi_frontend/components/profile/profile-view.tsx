"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Camera, Check, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { NftCard, type NftCardData } from "@/components/nft/nft-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";
import { getNftState, getPortfolio } from "@/lib/mock-data";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function ProfileView() {
  const { connected, address, shortAddress, disconnect } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [claimTx, setClaimTx] = useState<TxState | null>(null);
  const [copied, setCopied] = useState(false);
  const [pfp, setPfp] = useState<string | null>(null);
  const [selectedNft, setSelectedNft] = useState<NftCardData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const portfolio = useMemo(() => (address ? getPortfolio(address) : null), [address]);
  const nft = useMemo(() => (address ? getNftState(address) : null), [address]);

  // Opt-in profile picture, persisted per wallet address (client-only). Loaded on
  // address change via adjust-state-on-prop-change (no setState-in-effect).
  const [pfpFor, setPfpFor] = useState<string | null>(null);
  if (address !== pfpFor) {
    setPfpFor(address);
    setPfp(address ? window.localStorage.getItem(`af.pfp.${address}`) : null);
  }

  function copyAddress() {
    if (!address) return;
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !address) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPfp(url);
      window.localStorage.setItem(`af.pfp.${address}`, url);
    };
    reader.readAsDataURL(file);
  }

  if (!connected || !portfolio || !nft) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center px-5">
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8 text-center">
            <div className="text-[15px] font-bold">Connect a wallet to view your profile</div>
            <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-[#6B6B6B]">
              Your holdings, launched tokens, claimable creator fees, and NFTs live here.
            </p>
            <button
              onClick={() => setWalletOpen(true)}
              className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
            >
              Connect Wallet
            </button>
          </div>
        </div>
        <Footer />
        <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </div>
    );
  }

  const nftCollection: NftCardData[] = [];
  if (nft.verified) nftCollection.push({ kind: "verification", handle: nft.handle ?? "you" });
  if (nft.perk) nftCollection.push({ kind: "perk", level: nft.perk.level, discountBps: nft.perk.discountBps });
  for (const g of nft.genesis) nftCollection.push({ kind: "genesis", shareBps: g.shareBps, id: g.id });

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar shortAddress={shortAddress} onDisconnect={disconnect} />

      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-7">
        {/* overview */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10"
            aria-label="Set profile picture"
          >
            {pfp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pfp} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(45deg,#1c2733,#1c2733_5px,#222f3d_5px,#222f3d_10px)] font-mono text-[15px] font-bold text-signal">
                {address?.slice(0, 2)}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-4 w-4 text-white" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[15px] font-bold">
              {shortAddress}
              <button
                onClick={copyAddress}
                className="text-[#4b5563] transition-colors hover:text-signal"
                aria-label="Copy address"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[#6B6B6B]">
              {nft.verified ? (
                <span className="inline-flex items-center gap-1 text-signal">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified @{nft.handle}
                </span>
              ) : (
                <span>Handle not verified</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:ml-auto">
            <Stat label="PORTFOLIO" value={usd(portfolio.totalValueUsd)} />
            <Stat label="CLAIMABLE FEES" value={usd(portfolio.claimableUsd)} accent />
          </div>
        </div>

        {/* holdings */}
        <Section title="Holdings" count={portfolio.holdings.length}>
          <div className="overflow-hidden rounded-sm border border-white/[0.06]">
            <div className="grid grid-cols-[1fr_auto_88px] gap-3 bg-white/[0.03] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              <span>Token</span>
              <span className="text-right">24h</span>
              <span className="text-right">Value</span>
            </div>
            {portfolio.holdings.map((h) => (
              <Link
                key={h.handle}
                href={`/token/${h.handle}`}
                className="grid grid-cols-[1fr_auto_88px] items-center gap-3 border-t border-white/[0.05] px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-[repeating-linear-gradient(45deg,#1c2733,#1c2733_3px,#222f3d_3px,#222f3d_6px)]" />
                  <span className="truncate text-[13px] font-semibold">@{h.handle}</span>
                  <span className="font-mono text-[10px] text-[#6B6B6B]">
                    {h.amount.toLocaleString()} ${h.symbol}
                  </span>
                </span>
                <span className={cn("text-right font-mono text-[12px]", h.delta24h >= 0 ? "text-signal" : "text-noise")}>
                  {h.delta24h >= 0 ? "+" : ""}
                  {h.delta24h.toFixed(1)}%
                </span>
                <span className="text-right font-mono text-[13px]">{usd(h.valueUsd)}</span>
              </Link>
            ))}
          </div>
        </Section>

        {/* created tokens */}
        <Section title="Tokens you created" count={portfolio.created.length}>
          <div className="flex flex-col gap-2.5">
            {portfolio.created.map((c) => (
              <div key={c.handle} className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
                <div className="flex items-center gap-2">
                  <Link href={`/token/${c.handle}`} className="text-[14px] font-bold hover:text-signal">
                    @{c.handle}
                  </Link>
                  {c.verified ? (
                    <BadgeCheck className="h-4 w-4 text-signal" />
                  ) : (
                    <span className="rounded-full border border-noise/40 px-2 py-0.5 font-mono text-[8px] text-noise">
                      UNVERIFIED
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[12px] text-[#6B6B6B]">MCAP {usd(c.marketCap)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-sm border border-white/[0.06] bg-[#12181f] px-3.5 py-2.5">
                  <div>
                    <div className="font-mono text-[9px] text-[#6B6B6B]">CLAIMABLE CREATOR FEES</div>
                    <div className="font-mono text-[16px] font-bold text-signal">{usd(c.claimableUsd)}</div>
                  </div>
                  <button
                    onClick={() => {
                      if (!c.verified) return;
                      setClaimTx("pending");
                      setTimeout(() => setClaimTx("confirmed"), 1500);
                    }}
                    disabled={!c.verified || c.claimableUsd === 0}
                    className="rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {c.verified ? "CLAIM" : "VERIFY TO CLAIM"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {claimTx && (
            <div className="mt-3">
              <TxStatus
                state={claimTx}
                title={claimTx === "pending" ? "Claiming fees…" : "Fees claimed"}
                detail="Creator fee → your wallet"
                signature="7xРq…2mK9"
                explorerUrl="#"
              />
            </div>
          )}
        </Section>

        {/* NFTs — the actual issued assets */}
        <Section title="Your NFTs">
          {nftCollection.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {nftCollection.map((d, i) => (
                <NftCard key={i} data={d} onClick={() => setSelectedNft(d)} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[#6B6B6B]">
              No NFTs yet — verify your handle or mint a perk to start your collection.
            </p>
          )}
          <Link
            href="/nft"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-signal hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" /> Manage NFTs & auctions →
          </Link>
        </Section>
      </div>

      <Footer />
      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      <NftLanyard data={selectedNft} onClose={() => setSelectedNft(null)} />
    </div>
  );
}

function TopBar({ shortAddress, onDisconnect }: { shortAddress?: string | null; onDisconnect?: () => void }) {
  return (
    <nav className="flex items-center gap-4 border-b border-white/[0.08] px-5 py-3">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="font-mono text-[11px]">Feed</span>
      </Link>
      <span className="text-[#4b5563]">/</span>
      <span className="font-mono text-[12px]">Profile</span>
      {shortAddress && (
        <button
          onClick={onDisconnect}
          className="ml-auto rounded-sm border border-white/10 px-2.5 py-1 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:text-noise"
        >
          Disconnect
        </button>
      )}
    </nav>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] px-4 py-2.5">
      <div className="font-mono text-[9px] text-[#6B6B6B]">{label}</div>
      <div className={cn("mt-0.5 font-mono text-[18px] font-bold", accent && "text-signal")}>{value}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[14px] font-bold">{title}</h2>
        {count !== undefined && <span className="font-mono text-[11px] text-[#6B6B6B]">{count}</span>}
      </div>
      {children}
    </section>
  );
}
