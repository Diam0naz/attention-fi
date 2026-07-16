"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Lock, TrendingUp, Gift, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { getNftAuctions, getNftState } from "@/lib/mock-data";
import { NftCard, type NftCardData } from "@/components/nft/nft-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";

function usd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

const MAX_LEVEL = 5;

export function NftView() {
  const { connected, address, shortAddress, disconnect } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<{ state: TxState; title: string; detail: string } | null>(null);
  const [selected, setSelected] = useState<NftCardData | null>(null);

  const base = useMemo(() => (address ? getNftState(address) : null), [address]);
  const auctions = useMemo(() => getNftAuctions(), []);

  // Local demo state so "mint"/"level up" feel live; synced from mock on connect.
  const [verified, setVerified] = useState(false);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (base) {
      setVerified(base.verified);
      setLevel(base.perk?.level ?? 0);
    }
  }, [base]);

  function run(title: string, detail: string, after?: () => void) {
    setTx({ state: "pending", title, detail });
    setTimeout(() => {
      setTx({ state: "confirmed", title, detail });
      after?.();
    }, 1500);
  }

  if (!connected || !base) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center px-5">
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8 text-center">
            <div className="text-[15px] font-bold">Connect a wallet to manage NFTs</div>
            <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-[#6B6B6B]">
              Verification, perks, fee-share genesis NFTs, and 1-of-1 auctions live here.
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

  const discountBps = Math.min(500, level * 100);

  const collection: NftCardData[] = [];
  if (verified) collection.push({ kind: "verification", handle: base.handle ?? "you" });
  if (level > 0) collection.push({ kind: "perk", level, discountBps });
  for (const g of base.genesis) collection.push({ kind: "genesis", shareBps: g.shareBps, id: g.id });

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar shortAddress={shortAddress} onDisconnect={disconnect} />

      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-7">
        <div className="flex items-start gap-4">
          <div>
            <h1 className="text-[18px] font-bold">NFTs</h1>
            <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#6B6B6B]">
              Four on-chain roles: a soulbound verification credential, upgradeable trading perks,
              fee-share genesis NFTs, and 1-of-1 asset auctions.
            </p>
          </div>
          <Link
            href="/nft/create"
            className="ml-auto shrink-0 whitespace-nowrap rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
          >
            + Create
          </Link>
        </div>

        {tx && (
          <div className="mt-4">
            <TxStatus state={tx.state} title={tx.title} detail={tx.detail} signature="4xРq…9nP2" explorerUrl="#" />
          </div>
        )}

        {/* your collection — the actually-issued NFTs */}
        <div className="mt-6">
          <h2 className="text-[14px] font-bold">Your collection</h2>
          {collection.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {collection.map((d, i) => (
                <NftCard key={i} data={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-[#6B6B6B]">
              You don&apos;t hold any AttentionFi NFTs yet — mint one below and it&apos;ll appear here.
            </p>
          )}
        </div>

        {/* role cards — mint / upgrade / claim */}
        <h2 className="mt-9 text-[14px] font-bold">Manage</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {/* Verification (soulbound) */}
          <Card icon={<Lock className="h-4 w-4" />} title="Verification" tag="SOULBOUND">
            {verified ? (
              <>
                <div className="flex items-center gap-2 text-[13px] font-bold text-signal">
                  <BadgeCheck className="h-4 w-4" /> Verified @{base.handle}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#6B6B6B]">
                  A non-transferable SAS credential binds your X handle to this wallet on-chain —
                  it gates creator-fee claims and can never be moved or sold.
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-[#6B6B6B]">
                  Prove you own an X handle to mint a soulbound credential. Required before you can
                  claim creator fees on tokens you launch.
                </p>
                <button
                  onClick={() => run("Minting verification…", "Soulbound credential", () => setVerified(true))}
                  className="mt-3 rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
                >
                  VERIFY HANDLE
                </button>
              </>
            )}
          </Card>

          {/* Perk NFT (upgradeable) */}
          <Card icon={<TrendingUp className="h-4 w-4" />} title="Perk NFT" tag="UPGRADEABLE">
            {level > 0 ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[24px] font-bold text-signal">Lvl {level}</span>
                  <span className="font-mono text-[12px] text-[#9aa4af]">
                    {(discountBps / 100).toFixed(0)}% fee discount
                  </span>
                </div>
                <div className="mt-3 flex gap-1">
                  {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                    <div
                      key={i}
                      className={cn("h-1.5 flex-1 rounded-full", i < level ? "bg-signal" : "bg-white/10")}
                    />
                  ))}
                </div>
                <button
                  onClick={() =>
                    run("Leveling up perk…", `Level ${level} → ${level + 1}`, () =>
                      setLevel((l) => Math.min(MAX_LEVEL, l + 1)),
                    )
                  }
                  disabled={level >= MAX_LEVEL}
                  className="mt-3 rounded-sm border border-signal/40 px-4 py-2 font-mono text-[11px] font-bold text-signal disabled:opacity-40"
                >
                  {level >= MAX_LEVEL ? "MAX LEVEL" : "LEVEL UP → +1% OFF"}
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-[#6B6B6B]">
                  Mint a perk NFT to cut your trading fees. Level it up over time — +1% discount per
                  level, capped at 5%.
                </p>
                <button
                  onClick={() => run("Minting perk NFT…", "Perk · Level 1", () => setLevel(1))}
                  className="mt-3 rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
                >
                  MINT PERK
                </button>
              </>
            )}
          </Card>

          {/* Genesis fee-share */}
          <Card icon={<Gift className="h-4 w-4" />} title="Genesis (fee-share)" tag="TRANSFERABLE">
            {base.genesis.length ? (
              <div className="flex flex-col gap-2">
                {base.genesis.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-sm border border-white/[0.06] bg-[#12181f] px-3 py-2">
                    <div className="font-mono text-[11px]">
                      <span className="text-[#F5F4F0]">{g.id}</span>
                      <span className="ml-2 text-[#6B6B6B]">{(g.shareBps / 100).toFixed(1)}% share</span>
                    </div>
                    <button
                      onClick={() => run("Claiming genesis fees…", `${g.id} · ${usd(g.claimableUsd)}`)}
                      disabled={g.claimableUsd === 0}
                      className="rounded-sm bg-signal px-3 py-1.5 font-mono text-[10px] font-bold text-[#0A0A0A] disabled:opacity-40"
                    >
                      CLAIM {usd(g.claimableUsd)}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-[#6B6B6B]">
                Genesis NFTs earn a pro-rata cut of a subject&apos;s fee stream forever. You hold none
                yet — win one in the auctions below.
              </p>
            )}
          </Card>

          {/* Role legend / info */}
          <Card icon={<Gavel className="h-4 w-4" />} title="1-of-1 auctions" tag="DUTCH">
            <p className="text-[11px] leading-relaxed text-[#6B6B6B]">
              Rare assets — founder keys, genesis originals — sell via descending Dutch auction. No
              front-running: the price falls until someone buys. Live listings below.
            </p>
          </Card>
        </div>

        {/* auctions */}
        <h2 className="mt-9 text-[14px] font-bold">Live auctions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {auctions.map((a) => {
            const pct = Math.round(((a.currentUsd - a.floorUsd) / (a.startUsd - a.floorUsd)) * 100);
            return (
              <div key={a.id} className="overflow-hidden rounded-sm border border-white/[0.08] bg-[#0f1620]">
                <div className="flex h-24 items-center justify-center bg-[repeating-linear-gradient(45deg,#12202b,#12202b_8px,#152531_8px,#152531_16px)] font-mono text-[11px] text-signal">
                  {a.name}
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold">{a.name}</span>
                    <span className="font-mono text-[10px] text-[#6B6B6B]">@{a.handle}</span>
                  </div>
                  <div className="mt-2 font-mono text-[20px] font-bold text-signal">{usd(a.currentUsd)}</div>
                  <div className="mt-1 flex justify-between font-mono text-[9px] text-[#6B6B6B]">
                    <span>floor {usd(a.floorUsd)}</span>
                    <span>ends {a.endsIn}</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-signal/70" style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                  <button
                    onClick={() => run("Buying asset…", `${a.name} · ${usd(a.currentUsd)}`)}
                    className="mt-3 w-full rounded-sm bg-signal py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
                  >
                    BUY NOW
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Footer />
      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      <NftLanyard data={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function TopBar({ shortAddress, onDisconnect }: { shortAddress?: string | null; onDisconnect?: () => void }) {
  return (
    <nav className="flex items-center gap-4 border-b border-white/[0.08] px-5 py-3">
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="font-mono text-[11px]">Profile</span>
      </Link>
      <span className="text-[#4b5563]">/</span>
      <span className="font-mono text-[12px]">NFTs</span>
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

function Card({
  icon,
  title,
  tag,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-signal">{icon}</span>
        <span className="text-[13px] font-bold">{title}</span>
        <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 font-mono text-[8px] tracking-[0.08em] text-[#6B6B6B]">
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}
