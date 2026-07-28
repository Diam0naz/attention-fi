"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Gavel, Gift, Lock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { Footer } from "@/components/feed/footer";
import { NftCard, type NftCardData } from "@/components/nft/nft-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";
import { useOwnedNfts } from "@/components/nft/use-owned-nfts";
import { useNftPortfolio } from "@/components/nft/use-nft-portfolio";

export function NftView() {
  const { connected, shortAddress, disconnect } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [selected, setSelected] = useState<NftCardData | null>(null);

  // Real on-chain NFTs once connected — never masked with mock data, so an
  // RPC hiccup reads as "couldn't load", not as a fake collection.
  const owned = useOwnedNfts();

  // The Manage rows used to report mock state, so a wallet holding nothing was
  // shown a handle and a perk level that existed only in getNftState().
  const portfolioState = useNftPortfolio();
  const portfolio = portfolioState.data;

  const verified = portfolio?.verification != null;
  const handle = portfolio?.verification?.handle ?? "";
  const level = portfolio?.perk?.level ?? 0;
  const discountBps = portfolio?.perk?.discountBps ?? 0;
  const genesisCount = portfolio?.genesis.length ?? 0;
  const loadingPortfolio = portfolioState.status === "loading";

  if (!connected) {
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

  const collection = owned.data;

  const manage = [
    {
      href: "/nft/verification",
      icon: <Lock className="h-4 w-4" />,
      title: "Verification",
      tag: "SOULBOUND",
      // "Checking…" rather than "Not verified" until the read lands — the
      // latter is a claim about the wallet, and it would be wrong half a
      // second later for anyone who is verified.
      status: loadingPortfolio ? "Checking…" : verified ? `Verified @${handle}` : "Not verified",
      ok: verified,
    },
    {
      href: "/nft/perk",
      icon: <TrendingUp className="h-4 w-4" />,
      title: "Perk NFT",
      tag: "UPGRADEABLE",
      status: loadingPortfolio
        ? "Checking…"
        : level > 0
          ? `Lvl ${level} · ${(discountBps / 100).toFixed(0)}% off`
          : "None granted",
      ok: level > 0,
    },
    {
      href: "/nft/genesis",
      icon: <Gift className="h-4 w-4" />,
      title: "Genesis (fee-share)",
      tag: "TRANSFERABLE",
      status: loadingPortfolio ? "Checking…" : genesisCount ? `${genesisCount} held` : "None held",
      ok: genesisCount > 0,
    },
    {
      href: "/nft/auctions",
      icon: <Gavel className="h-4 w-4" />,
      title: "1-of-1 auctions",
      tag: "DUTCH",
      status: "Browse & list",
      ok: false,
    },
  ];

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

        {/* your collection — the actually-issued NFTs */}
        <div className="mt-6">
          <h2 className="text-[14px] font-bold">Your collection</h2>
          {owned.status === "loading" ? (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="aspect-3/4 animate-pulse rounded-sm bg-white/4" />
              ))}
            </div>
          ) : owned.status === "error" ? (
            <p className="mt-2 text-[12px] text-noise">
              Couldn&apos;t reach the chain to load your NFTs — check your connection and reload.
            </p>
          ) : collection.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {collection.map((d, i) => (
                <NftCard key={i} data={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-[#6B6B6B]">
              You don&apos;t hold any AttentionFi NFTs yet — open a role below to mint your first.
            </p>
          )}
        </div>

        {/* manage — each card opens a dedicated management screen */}
        <h2 className="mt-9 text-[14px] font-bold">Manage</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {manage.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-center gap-3 rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 transition-colors hover:border-signal/30"
            >
              <span className="text-signal">{c.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold">{c.title}</span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[8px] tracking-[0.08em] text-[#6B6B6B]">
                    {c.tag}
                  </span>
                </div>
                <div className={cn("mt-0.5 truncate font-mono text-[11px]", c.ok ? "text-signal" : "text-[#6B6B6B]")}>
                  {c.status}
                </div>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-[#4b5563] transition-colors group-hover:text-signal" />
            </Link>
          ))}
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
