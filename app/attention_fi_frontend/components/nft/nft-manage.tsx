"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, Gavel, Gift, Lock, Plus, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { NftCard, NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { getNftAuctions, getNftState } from "@/lib/mock-data";

export type Section = "verification" | "perk" | "genesis" | "auctions";

const MAX_LEVEL = 5;

const META: Record<Section, { title: string; icon: React.ReactNode }> = {
  verification: { title: "Verification", icon: <Lock className="h-4 w-4" /> },
  perk: { title: "Perk NFTs", icon: <TrendingUp className="h-4 w-4" /> },
  genesis: { title: "Genesis NFTs", icon: <Gift className="h-4 w-4" /> },
  auctions: { title: "1-of-1 Auctions", icon: <Gavel className="h-4 w-4" /> },
};

function usd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function NftManage({ section }: { section: Section }) {
  const { connected, address, shortAddress, disconnect } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [selected, setSelected] = useState<NftCardData | null>(null);
  const [perkModal, setPerkModal] = useState(false);
  const [tx, setTx] = useState<{ state: TxState; title: string; detail: string } | null>(null);

  const base = useMemo(() => (address ? getNftState(address) : null), [address]);
  const auctions = useMemo(() => getNftAuctions(), []);

  // Local demo state so mint / verify / level-up feel live.
  const [verified, setVerified] = useState(false);
  const [level, setLevel] = useState(0);
  const [handle, setHandle] = useState("");
  useEffect(() => {
    if (base) {
      setVerified(base.verified);
      setLevel(base.perk?.level ?? 0);
      setHandle(base.handle ?? "");
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
      <Shell title={META[section].title}>
        <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8 text-center">
          <div className="text-[15px] font-bold">Connect a wallet to manage NFTs</div>
          <button
            onClick={() => setWalletOpen(true)}
            className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
          >
            Connect Wallet
          </button>
        </div>
        <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </Shell>
    );
  }

  const discountBps = Math.min(500, level * 100);

  return (
    <Shell title={META[section].title} icon={META[section].icon} shortAddress={shortAddress} onDisconnect={disconnect}>
      {tx && (
        <div className="mb-4">
          <TxStatus state={tx.state} title={tx.title} detail={tx.detail} signature="4xРq…9nP2" explorerUrl="#" />
        </div>
      )}

      {/* VERIFICATION */}
      {section === "verification" &&
        (verified ? (
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <div className="mx-auto w-44 sm:mx-0 sm:w-full">
              <NftCard data={{ kind: "verification", handle: handle || "you" }} onClick={() => setSelected({ kind: "verification", handle: handle || "you" })} />
            </div>
            <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
              <div className="flex items-center gap-2 text-[15px] font-bold text-signal">
                <BadgeCheck className="h-5 w-5" /> Verified @{handle}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#6B6B6B]">
                A soulbound SAS credential binds this handle to your wallet on-chain. It gates
                creator-fee claims and can never be transferred or sold.
              </p>
              <dl className="mt-4 flex flex-col gap-2 font-mono text-[11px]">
                <Row k="STATUS" v="Active" accent />
                <Row k="STANDARD" v="SAS · Metaplex Core" />
                <Row k="TRANSFERABLE" v="No (soulbound)" />
                <Row k="GATES" v="Creator-fee claims" />
              </dl>
            </div>
          </div>
        ) : (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6">
            <div className="text-[14px] font-bold">Get verified</div>
            <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[#6B6B6B]">
              Prove you own an X handle to mint a soulbound credential — required before you can
              claim creator fees on tokens you launch.
            </p>
            <ol className="mt-4 flex flex-col gap-3">
              {[
                ["Wallet connected", `${shortAddress}`, true],
                ["Enter & sign for your handle", "one signature, no gas", verified],
                ["Soulbound credential mints", "binds handle ↔ wallet forever", verified],
              ].map(([t, d, done], i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px]", done ? "border-signal bg-signal text-[#0A0A0A]" : "border-white/20 text-[#6B6B6B]")}>
                    {done ? "✓" : i + 1}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold">{t}</div>
                    <div className="font-mono text-[10px] text-[#6B6B6B]">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center rounded-sm border border-white/10 bg-[#12181f] px-3">
              <span className="text-[#6B6B6B]">@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="handle"
                className="w-full bg-transparent px-1.5 py-2.5 text-[13px] outline-none placeholder:text-[#4b5563]"
              />
            </div>
            <button
              onClick={() => handle && run("Minting verification…", `@${handle}`, () => setVerified(true))}
              disabled={!handle}
              className="mt-3 w-full rounded-sm bg-signal py-3 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-40"
            >
              SIGN & VERIFY
            </button>
          </div>
        ))}

      {/* PERK */}
      {section === "perk" &&
        (level > 0 ? (
          <div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <NftCard data={{ kind: "perk", level, discountBps }} onClick={() => setPerkModal(true)} />
            </div>
            <p className="mt-3 font-mono text-[11px] text-[#6B6B6B]">Tap your perk to upgrade it.</p>
          </div>
        ) : (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6 text-center">
            <TrendingUp className="mx-auto h-6 w-6 text-signal" />
            <div className="mt-3 text-[14px] font-bold">Mint a perk NFT</div>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[#6B6B6B]">
              Cut your trading fees with an upgradeable perk — +1% discount per level, capped at 5%.
            </p>
            <button
              onClick={() => run("Minting perk NFT…", "Perk · Level 1", () => setLevel(1))}
              className="mt-4 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
            >
              MINT PERK
            </button>
          </div>
        ))}

      {/* GENESIS */}
      {section === "genesis" &&
        (base.genesis.length ? (
          <div className="flex flex-col gap-3">
            {base.genesis.map((g) => (
              <div key={g.id} className="flex flex-col gap-4 rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 sm:flex-row sm:items-center">
                <button onClick={() => setSelected({ kind: "genesis", shareBps: g.shareBps, id: g.id })} className="w-28 shrink-0 self-center sm:self-auto">
                  <NftCardFace data={{ kind: "genesis", shareBps: g.shareBps, id: g.id }} />
                </button>
                <div className="flex-1">
                  <div className="font-mono text-[13px] font-bold">{g.id}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#6B6B6B]">{(g.shareBps / 100).toFixed(1)}% revenue share</div>
                  <div className="mt-2 font-mono text-[10px] text-[#6B6B6B]">CLAIMABLE</div>
                  <div className="font-mono text-[18px] font-bold text-signal">{usd(g.claimableUsd)}</div>
                </div>
                <button
                  onClick={() => run("Claiming genesis fees…", `${g.id} · ${usd(g.claimableUsd)}`)}
                  disabled={g.claimableUsd === 0}
                  className="rounded-sm bg-signal px-5 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
                >
                  CLAIM
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6 text-center">
            <Gift className="mx-auto h-6 w-6 text-pulse" />
            <div className="mt-3 text-[14px] font-bold">No genesis NFTs yet</div>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[#6B6B6B]">
              Genesis NFTs earn a pro-rata cut of a subject&apos;s fee stream forever. Win one in the
              1-of-1 auctions, or issue your own for a token you created.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/nft/auctions" className="rounded-sm border border-white/15 px-4 py-2 font-mono text-[11px] font-bold">Browse auctions</Link>
              <Link href="/nft/create" className="rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A]">Issue genesis →</Link>
            </div>
          </div>
        ))}

      {/* AUCTIONS */}
      {section === "auctions" && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold">Your listings</h2>
            <Link href="/nft/create" className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-signal">
              <Plus className="h-3 w-3" /> List a 1-of-1
            </Link>
          </div>
          <p className="mt-2 rounded-sm border border-dashed border-white/12 p-5 text-center font-mono text-[11px] text-[#6B6B6B]">
            No active listings — list a rare asset to start a descending Dutch auction.
          </p>

          <h2 className="mt-8 text-[13px] font-bold">Live market</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {auctions.map((a) => {
              const pct = Math.round(((a.currentUsd - a.floorUsd) / (a.startUsd - a.floorUsd)) * 100);
              return (
                <div key={a.id} className="overflow-hidden rounded-sm border border-white/[0.08] bg-[#0f1620]">
                  <div className="flex h-20 items-center justify-center bg-[repeating-linear-gradient(45deg,#12202b,#12202b_8px,#152531_8px,#152531_16px)] font-mono text-[11px] text-signal">
                    {a.name}
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold">{a.name}</span>
                      <span className="font-mono text-[10px] text-[#6B6B6B]">@{a.handle}</span>
                    </div>
                    <div className="mt-1.5 font-mono text-[18px] font-bold text-signal">{usd(a.currentUsd)}</div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
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
      )}

      <NftLanyard data={selected} onClose={() => setSelected(null)} />
      {perkModal && (
        <PerkModal
          level={level}
          discountBps={discountBps}
          onClose={() => setPerkModal(false)}
          onLevelUp={() => run("Leveling up perk…", `Level ${level} → ${level + 1}`, () => setLevel((l) => Math.min(MAX_LEVEL, l + 1)))}
        />
      )}
      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </Shell>
  );
}

function PerkModal({
  level,
  discountBps,
  onClose,
  onLevelUp,
}: {
  level: number;
  discountBps: number;
  onClose: () => void;
  onLevelUp: () => void;
}) {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-[#0d141c] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-white/[0.08] px-5 py-4">
          <span className="font-mono text-[13px] font-bold">Manage perk</span>
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-[#6B6B6B] hover:bg-white/10 hover:text-[#F5F4F0]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-5 p-5">
          <div className="w-32 shrink-0">
            <NftCardFace data={{ kind: "perk", level, discountBps }} />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[11px] text-[#6B6B6B]">CURRENT DISCOUNT</div>
            <div className="font-mono text-[22px] font-bold text-signal">{(discountBps / 100).toFixed(0)}% off</div>
            <div className="mt-3 flex gap-1">
              {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < level ? "bg-signal" : "bg-white/10")} />
              ))}
            </div>
            <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">Level {level} of {MAX_LEVEL}</div>
            <button
              onClick={onLevelUp}
              disabled={level >= MAX_LEVEL}
              className="mt-4 w-full rounded-sm bg-signal py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
            >
              {level >= MAX_LEVEL ? "MAX LEVEL" : "LEVEL UP → +1% OFF"}
            </button>
          </div>
        </div>
        <p className="border-t border-white/[0.06] px-5 py-3 text-[11px] leading-relaxed text-[#6B6B6B]">
          Leveling up rewrites the NFT&apos;s on-chain Attributes for a higher fee discount. The
          asset stays in your wallet — only its plugin data changes.
        </p>
      </div>
    </div>
  );
}

function Shell({
  children,
  title,
  icon,
  shortAddress,
  onDisconnect,
}: {
  children: React.ReactNode;
  title: string;
  icon?: React.ReactNode;
  shortAddress?: string | null;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-3">
        <Link href="/nft" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono text-[11px]">NFTs</span>
        </Link>
        <span className="text-[#4b5563]">/</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-signal">
          {icon}
          {title}
        </span>
        {shortAddress && (
          <button onClick={onDisconnect} className="ml-auto rounded-sm border border-white/10 px-2.5 py-1 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:text-noise">
            Disconnect
          </button>
        )}
      </nav>
      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-7">{children}</div>
      <Footer />
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between border-b border-white/[0.06] pb-2 last:border-0">
      <span className="text-[#6B6B6B]">{k}</span>
      <span className={accent ? "text-signal" : "text-[#F5F4F0]"}>{v}</span>
    </div>
  );
}
