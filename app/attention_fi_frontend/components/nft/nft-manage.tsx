"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { ArrowLeft, BadgeCheck, Gavel, Gift, Lock, Plus, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { NftCard, NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { TiltCard } from "@/components/reactbits/tilt-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { getNftState } from "@/lib/mock-data";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";
import { explorerTx } from "@/lib/solana/config";
import { SkinPicker } from "@/components/nft/skin-picker";
import {
  auctionEnded,
  currentAuctionPrice,
  fetchCollections,
  fetchListableNfts,
  fetchNftAuctions,
  type CollectionData,
  type NftAuctionData,
  type OwnedAsset,
} from "@/lib/solana/nft-data";

const LAMPORTS_PER_SOL = 1_000_000_000;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const sol = (lamports: bigint): string => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(3);

/** Compact time-remaining label for a descending auction. */
function countdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "ended";
  const d = Math.floor(secondsLeft / 86_400);
  const h = Math.floor((secondsLeft % 86_400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const sec = Math.floor(secondsLeft % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

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
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  const base = useMemo(() => (address ? getNftState(address) : null), [address]);

  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();
  const [auctions, setAuctions] = useState<NftAuctionData[]>([]);
  const [auctionsStatus, setAuctionsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [treasury, setTreasury] = useState<string | null>(null);
  // Buying used to fire straight from the card. On a descending auction that
  // spends real SOL with no chance to read the price first, so confirm.
  const [confirmBuy, setConfirmBuy] = useState<NftAuctionData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Collectibles the wallet holds that aren't escrowed anywhere — the pool
  // `list_nft_auction` can draw from. Tagged with the wallet it was read for,
  // so a wallet switch can't briefly offer the previous owner's assets.
  const [listable, setListable] = useState<{ owner: string; assets: OwnedAsset[] }>({
    owner: "",
    assets: [],
  });
  const [listOpen, setListOpen] = useState(false);
  const listableAssets = address && listable.owner === address ? listable.assets : [];
  // Collections this wallet is the update authority for.
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [collectionsNonce, setCollectionsNonce] = useState(0);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Real 1-of-1 auctions from the chain — only while this section is open.
  useEffect(() => {
    if (section !== "auctions") return;
    let cancelled = false;
    setAuctionsStatus("loading");
    Promise.all([fetchNftAuctions(readProgram), fetchGlobal(readProgram)])
      .then(([list, global]) => {
        if (cancelled) return;
        setAuctions(list);
        setTreasury(global?.treasury ?? null);
        setAuctionsStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setAuctionsStatus("error");
      });
    const poll = setInterval(() => {
      fetchNftAuctions(readProgram).then((list) => {
        if (!cancelled) setAuctions(list);
      }).catch(() => undefined);
    }, 10_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [section, readProgram]);

  // Listable collectibles are a separate, wallet-scoped read: it scans every
  // Core asset the wallet owns, so it stays out of the 10s auction poll.
  useEffect(() => {
    if (section !== "auctions" || !address) return;
    let cancelled = false;
    fetchListableNfts(readProgram, new PublicKey(address))
      .then((assets) => {
        if (!cancelled) setListable({ owner: address, assets });
      })
      .catch(() => {
        if (!cancelled) setListable({ owner: address, assets: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [section, address, readProgram]);

  async function buyNow(a: NftAuctionData) {
    if (!signProgram || !address) return setWalletOpen(true);
    if (!treasury) return;
    const price = currentAuctionPrice(a, now);
    // Price only falls before the auction ends, so a small cushion above the
    // client-observed price absorbs clock drift without ever overpaying.
    const maxPrice = (price * 102n) / 100n;
    setTx({ state: "pending", title: "Buying asset…", detail: short(a.asset) });
    try {
      const sig = await signProgram.methods
        .buyNft(new BN(maxPrice.toString()))
        .accountsPartial({
          buyer: new PublicKey(address),
          treasury: new PublicKey(treasury),
          creator: new PublicKey(a.creator),
          asset: new PublicKey(a.asset),
        })
        .rpc();
      setTx({
        state: "confirmed",
        title: "Bought",
        detail: `${short(a.asset)} · ${sol(price)} SOL`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      setAuctions((prev) => prev.map((x) => (x.asset === a.asset ? { ...x, complete: true } : x)));
    } catch (e) {
      setTx({
        state: "failed",
        title: "Buy failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    }
  }

  useEffect(() => {
    if (section !== "auctions" || !address) return;
    let cancelled = false;
    void (async () => {
      const list = await fetchCollections(readProgram, new PublicKey(address)).catch(() => []);
      if (!cancelled) setCollections(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [section, address, readProgram, collectionsNonce]);

  /** Create a Core collection owned by this wallet. */
  async function createCollection() {
    if (!signProgram || !address) return setWalletOpen(true);
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    try {
      // The collection account signs its own creation, so it can't be a PDA.
      const kp = Keypair.generate();
      const sig = await signProgram.methods
        .createCollection(name.slice(0, 64), "")
        .accounts({ payer: new PublicKey(address), collection: kp.publicKey })
        .signers([kp])
        .rpc();
      setNewCollectionName("");
      setCollectionsNonce((n) => n + 1);
      setTx({
        state: "confirmed",
        title: "Collection created",
        detail: name,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
    } catch (e) {
      setTx({
        state: "failed",
        title: "Could not create collection",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setCreatingCollection(false);
    }
  }

  /**
   * Return an unsold 1-of-1 to its lister once the window has closed.
   * Permissionless on-chain (the asset can only go back to `auction.creator`),
   * so this is offered on any expired listing, not just the caller's own.
   */
  async function reclaim(a: NftAuctionData) {
    if (!signProgram || !address) return setWalletOpen(true);
    setTx({ state: "pending", title: "Reclaiming asset…", detail: a.name });
    try {
      const sig = await signProgram.methods
        .reclaimNftAuction()
        .accountsPartial({
          payer: new PublicKey(address),
          creator: new PublicKey(a.creator),
          asset: new PublicKey(a.asset),
        })
        .rpc();
      setTx({
        state: "confirmed",
        title: "Reclaimed",
        detail: `${a.name} → ${short(a.creator)}`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      setAuctions((prev) => prev.map((x) => (x.asset === a.asset ? { ...x, complete: true } : x)));
    } catch (e) {
      setTx({
        state: "failed",
        title: "Reclaim failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    }
  }

  /** Escrow an already-minted collectible as a new descending auction. */
  async function listExisting(
    asset: OwnedAsset,
    startPrice: number,
    floorPrice: number,
    durationHours: number,
  ) {
    if (!signProgram || !address) return setWalletOpen(true);
    setTx({ state: "pending", title: "Listing asset…", detail: asset.name });
    try {
      const toLamports = (n: number) => new BN(Math.round(n * LAMPORTS_PER_SOL).toString());
      const sig = await signProgram.methods
        .listNftAuction(
          toLamports(startPrice),
          toLamports(floorPrice),
          new BN(Math.round(durationHours * 3600).toString()),
        )
        .accountsPartial({
          creator: new PublicKey(address),
          asset: new PublicKey(asset.asset),
          // Core refuses a transfer of a collection member unless the
          // collection is passed; standalone assets must pass null instead.
          collection: asset.collection ? new PublicKey(asset.collection) : null,
        })
        .rpc();
      setTx({
        state: "confirmed",
        title: "Listed",
        detail: `${asset.name} · ${startPrice} → ${floorPrice} SOL`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      setListOpen(false);
      void fetchNftAuctions(readProgram).then(setAuctions).catch(() => undefined);
      // The asset now belongs to the auction PDA, so drop it from the pool
      // rather than waiting on a full re-scan of the wallet.
      setListable((prev) => ({ ...prev, assets: prev.assets.filter((x) => x.asset !== asset.asset) }));
    } catch (e) {
      setTx({
        state: "failed",
        title: "Listing failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    }
  }

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
        {/* No auction cards render on this branch, so no buy can be pending
            here — the confirm modal lives with the connected view. */}
        <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </Shell>
    );
  }

  const discountBps = Math.min(500, level * 100);

  return (
    <Shell title={META[section].title} icon={META[section].icon} shortAddress={shortAddress} onDisconnect={disconnect}>
      {tx && (
        <div className="mb-4">
          <TxStatus
            state={tx.state}
            title={tx.title}
            detail={tx.detail}
            signature={tx.signature ?? "4xРq…9nP2"}
            explorerUrl={tx.explorerUrl ?? "#"}
          />
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
              {address && <SkinPicker subject={address} />}
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
      {section === "auctions" && (() => {
        const live = auctions.filter((a) => !a.complete && !auctionEnded(a, now));
        const mine = address ? live.filter((a) => a.creator === address) : [];
        const market = address ? live.filter((a) => a.creator !== address) : live;
        // Expired-but-unsold listings still hold the asset in escrow. They used
        // to be filtered out with `live`, which hid the fact that the NFT was
        // stuck and gave no way to get it back.
        const expired = auctions.filter((a) => !a.complete && auctionEnded(a, now));
        const mineExpired = address ? expired.filter((a) => a.creator === address) : [];
        return (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-bold">Your listings</h2>
              {listableAssets.length > 0 ? (
                <button
                  onClick={() => setListOpen(true)}
                  className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-signal"
                >
                  <Plus className="h-3 w-3" /> List a 1-of-1
                </button>
              ) : (
                <Link href="/nft/create" className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-signal">
                  <Plus className="h-3 w-3" /> Mint a 1-of-1
                </Link>
              )}
            </div>
            {auctionsStatus === "loading" ? (
              <p className="mt-2 rounded-sm border border-dashed border-white/12 p-5 text-center font-mono text-[11px] text-[#6B6B6B]">
                Loading listings…
              </p>
            ) : auctionsStatus === "error" ? (
              <p className="mt-2 rounded-sm border border-dashed border-noise/30 p-5 text-center font-mono text-[11px] text-noise">
                Couldn&apos;t reach the chain to load auctions.
              </p>
            ) : mine.length === 0 ? (
              <p className="mt-2 rounded-sm border border-dashed border-white/12 p-5 text-center font-mono text-[11px] text-[#6B6B6B]">
                No active listings — list a rare asset to start a descending Dutch auction.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {mine.map((a) => (
                  <AuctionCard key={a.asset} auction={a} now={now} mine onBuy={setConfirmBuy} />
                ))}
              </div>
            )}

            <h2 className="mt-8 text-[13px] font-bold">Live market</h2>
            {auctionsStatus === "ready" && market.length === 0 ? (
              <p className="mt-2 rounded-sm border border-dashed border-white/12 p-5 text-center font-mono text-[11px] text-[#6B6B6B]">
                {mine.length > 0
                  ? "No listings from other creators yet — your own are above."
                  : "No open auctions right now — check back soon."}
              </p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {market.map((a) => (
                  <AuctionCard key={a.asset} auction={a} now={now} onBuy={setConfirmBuy} />
                ))}
              </div>
            )}

            {/* Collections — the parent assets a mint can join. Built here as
                well as in the create flow, so a deck can be set up before
                there's anything to put in it. */}
            <h2 className="mt-8 text-[13px] font-bold">Collections</h2>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#6B6B6B]">
              Assets minted into a collection share one on-chain parent and get the stacked-deck
              treatment on their cards. Membership is set when the asset is minted, so create the
              collection first, then pick it on the{" "}
              <Link href="/nft/create" className="text-signal">
                mint page
              </Link>
              .
            </p>
            {collections.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {collections.map((c) => (
                  <div
                    key={c.address}
                    className="rounded-sm border border-white/[0.08] bg-[#0f1620] px-3 py-2"
                  >
                    <div className="font-mono text-[11px] font-bold">{c.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
                      {c.size} {c.size === 1 ? "asset" : "assets"} · {short(c.address)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex max-w-md gap-1.5">
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value.slice(0, 64))}
                placeholder="New collection name"
                className="min-w-0 flex-1 rounded-sm border border-white/10 bg-[#12181f] px-3 py-2 text-[12px] outline-none placeholder:text-[#4b5563]"
              />
              <button
                onClick={() => void createCollection()}
                disabled={creatingCollection || newCollectionName.trim() === ""}
                className="shrink-0 rounded-sm border border-signal/40 bg-signal/10 px-3 py-2 font-mono text-[11px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creatingCollection ? "CREATING…" : "CREATE"}
              </button>
            </div>

            {expired.length > 0 && (
              <>
                <h2 className="mt-8 text-[13px] font-bold">Ended without a buyer</h2>
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#6B6B6B]">
                  The asset is still held in escrow by the auction. Reclaiming returns it to
                  whoever listed it — anyone can trigger it, and it can only ever go back to
                  the lister.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {/* the lister's own first — they're the ones waiting on it */}
                  {[...mineExpired, ...expired.filter((a) => !mineExpired.includes(a))].map((a) => (
                    <AuctionCard
                      key={a.asset}
                      auction={a}
                      now={now}
                      mine={a.creator === address}
                      onBuy={setConfirmBuy}
                      onReclaim={reclaim}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      <NftLanyard data={selected} onClose={() => setSelected(null)} />
      {perkModal && (
        <PerkModal
          level={level}
          discountBps={discountBps}
          onClose={() => setPerkModal(false)}
          onLevelUp={() => run("Leveling up perk…", `Level ${level} → ${level + 1}`, () => setLevel((l) => Math.min(MAX_LEVEL, l + 1)))}
        />
      )}
      {confirmBuy && (
        <BuyConfirm
          auction={confirmBuy}
          now={now}
          onCancel={() => setConfirmBuy(null)}
          onConfirm={() => {
            const a = confirmBuy;
            setConfirmBuy(null);
            void buyNow(a);
          }}
        />
      )}
      {listOpen && (
        <ListExistingModal
          assets={listableAssets}
          onCancel={() => setListOpen(false)}
          onList={(asset, s, f, h) => void listExisting(asset, s, f, h)}
        />
      )}
      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </Shell>
  );
}

function AuctionCard({
  auction,
  now,
  mine,
  onBuy,
  onReclaim,
}: {
  auction: NftAuctionData;
  now: number;
  mine?: boolean;
  onBuy: (a: NftAuctionData) => void;
  /** Present only for ended listings, where buying is no longer possible. */
  onReclaim?: (a: NftAuctionData) => void;
}) {
  const price = currentAuctionPrice(auction, now);
  const span = auction.startPrice - auction.floorPrice;
  const fallen = span > 0n ? auction.startPrice - price : 0n;
  const pct = span > 0n ? Number((fallen * 100n) / span) : 0;
  const cardData: NftCardData = {
    kind: "custom",
    name: auction.name,
    image: auction.uri,
  };
  const secondsLeft = auction.startTime + auction.duration - Math.floor(now / 1000);
  return (
    <div className="group relative z-0 flex flex-col hover:z-10">
      {/* Deck treatment (fanned ghost cards behind, on hover) only for assets
          that genuinely belong to an mpl-core collection — everything else
          keeps the normal TiltCard, same as every other card in the app. */}
      {auction.collection ? (
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 -rotate-2 rounded-xl border border-white/[0.08] bg-[#101820] opacity-60 transition-transform duration-300 ease-out group-hover:translate-x-2.5 group-hover:translate-y-2 group-hover:-rotate-6"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 translate-x-2 translate-y-2 rotate-1 rounded-xl border border-white/[0.05] bg-[#0c1219] opacity-35 transition-transform duration-300 ease-out group-hover:translate-x-5 group-hover:translate-y-4 group-hover:rotate-5"
          />
          <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-1">
            <NftCardFace data={cardData} />
          </div>
        </div>
      ) : (
        <TiltCard>
          <NftCardFace data={cardData} />
        </TiltCard>
      )}

      {/* details card below the deck */}
      <div className="mt-3 rounded-sm border border-white/[0.08] bg-[#0f1620] p-3.5">
        <div className="flex items-center justify-between">
          <span className="truncate font-mono text-[12px] font-bold">{auction.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-[#6B6B6B]">by {short(auction.creator)}</span>
        </div>
        <div className="mt-1.5 font-mono text-[18px] font-bold text-signal">{sol(price)} SOL</div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-signal/70" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
          <span>{secondsLeft > 0 ? `${countdown(secondsLeft)} left` : "ended"}</span>
          <span>floor {sol(auction.floorPrice)}</span>
        </div>
        {onReclaim ? (
          // An ended auction can't be bought at any price, so offering BUY NOW
          // here would only produce a guaranteed on-chain rejection.
          <button
            onClick={() => onReclaim(auction)}
            className="mt-3 w-full rounded-sm border border-signal/40 bg-signal/10 py-2 font-mono text-[11px] font-bold text-signal"
          >
            {mine ? "RECLAIM ASSET" : "RETURN TO LISTER"}
          </button>
        ) : mine ? (
          <div className="mt-3 w-full rounded-sm border border-white/10 py-2 text-center font-mono text-[11px] text-[#6B6B6B]">
            LISTED BY YOU
          </div>
        ) : (
          <button
            onClick={() => onBuy(auction)}
            className="mt-3 w-full rounded-sm bg-signal py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
          >
            BUY NOW
          </button>
        )}
      </div>
    </div>
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
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-white/10 bg-[#0d141c] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-white/[0.08] px-5 py-4">
          <span className="font-mono text-[13px] font-bold">Manage perk</span>
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-[#6B6B6B] hover:bg-white/10 hover:text-[#F5F4F0]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-start">
          <div className="w-44 max-w-full shrink-0">
            <NftCardFace data={{ kind: "perk", level, discountBps }} />
          </div>
          <div className="w-full flex-1">
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

/**
 * List an already-minted collectible as a descending auction.
 *
 * `start_nft_auction` can only list an asset it mints in the same transaction,
 * so anything from `mint_nft` was previously unlistable — this drives
 * `list_nft_auction`, which escrows an existing asset instead.
 */
function ListExistingModal({
  assets,
  onCancel,
  onList,
}: {
  assets: OwnedAsset[];
  onCancel: () => void;
  onList: (asset: OwnedAsset, start: number, floor: number, hours: number) => void;
}) {
  useScrollLock(true);
  const [picked, setPicked] = useState<OwnedAsset | null>(assets[0] ?? null);
  const [start, setStart] = useState("1");
  const [floor, setFloor] = useState("0.1");
  const [hours, setHours] = useState("24");

  const startNum = Number(start);
  const floorNum = Number(floor);
  const hoursNum = Number(hours);
  // Mirrors the program's require!s, so an invalid listing is rejected here
  // rather than costing a failed transaction.
  const invalid =
    !picked ||
    !Number.isFinite(startNum) ||
    !Number.isFinite(floorNum) ||
    !Number.isFinite(hoursNum) ||
    floorNum <= 0 ||
    startNum < floorNum ||
    hoursNum <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-white/[0.1] bg-[#0f1620] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[14px] font-bold">List a 1-of-1</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#6B6B6B]">
              Escrows the asset until it sells or the window closes.
            </div>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          Choose an asset
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {assets.map((a) => (
            <button
              key={a.asset}
              onClick={() => setPicked(a)}
              className={cn(
                "overflow-hidden rounded-sm border p-1.5 text-left transition-colors",
                picked?.asset === a.asset
                  ? "border-signal bg-signal/10"
                  : "border-white/[0.08] hover:border-white/25",
              )}
            >
              <div className="truncate font-mono text-[10px] font-bold">{a.name}</div>
              <div className="truncate font-mono text-[9px] text-[#6B6B6B]">{short(a.asset)}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Field label="Start (SOL)" value={start} onChange={setStart} />
          <Field label="Floor (SOL)" value={floor} onChange={setFloor} />
          <Field label="Hours" value={hours} onChange={setHours} />
        </div>

        {startNum < floorNum && (
          <p className="mt-2 font-mono text-[10px] text-noise">
            Start price must be at or above the floor — the price only descends.
          </p>
        )}

        <button
          disabled={invalid}
          onClick={() => picked && onList(picked, startNum, floorNum, hoursNum)}
          className="mt-4 w-full rounded-sm bg-signal py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
        >
          LIST FOR AUCTION
        </button>
        <p className="mt-2 text-center font-mono text-[10px] leading-relaxed text-[#4b5563]">
          If nobody buys, reclaim it from &ldquo;Ended without a buyer&rdquo; once the window closes.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] text-[#6B6B6B]">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="mt-1 w-full rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-2 py-1.5 font-mono text-[12px] outline-none focus:border-signal/50"
      />
    </label>
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

/**
 * Confirmation step for buying a listed 1-of-1.
 *
 * A Dutch auction's price moves while you look at it, so this shows the live
 * price as it ticks and states the max that will actually be authorised — the
 * purchase spends real SOL and previously fired on a single click with no
 * chance to read either number.
 */
function BuyConfirm({
  auction,
  now,
  onCancel,
  onConfirm,
}: {
  auction: NftAuctionData;
  now: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useScrollLock(true);
  const price = currentAuctionPrice(auction, now);
  // Mirrors buyNow's cushion, so the number shown is the number authorised.
  const maxPrice = (price * 102n) / 100n;
  const secondsLeft = auction.startTime + auction.duration - Math.floor(now / 1000);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-sm border border-white/[0.1] bg-[#0f1620] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[14px] font-bold">Buy 1-of-1</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-[#6B6B6B]">
              {auction.name}
            </div>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-sm border border-white/[0.08] bg-[#0A0A0A] p-3">
          <div className="font-mono text-[22px] font-bold text-signal tabular-nums">
            {sol(price)} <span className="text-[12px] text-[#6B6B6B]">SOL</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
            CURRENT PRICE · still falling toward {sol(auction.floorPrice)}
          </div>
        </div>

        <dl className="mt-3 flex flex-col gap-2 font-mono text-[11px]">
          {[
            ["Max authorised", `${sol(maxPrice)} SOL`],
            ["Time remaining", secondsLeft > 0 ? countdown(secondsLeft) : "ended"],
            ["Seller", short(auction.creator)],
            ["Asset", short(auction.asset)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-white/[0.06] pb-1.5 last:border-0">
              <span className="text-[#6B6B6B]">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </dl>

        <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#4b5563]">
          The price only falls before the auction ends. The small cushion above
          the displayed price absorbs clock drift — you are never charged more
          than the chain&apos;s price at settlement.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-sm border border-white/12 py-2.5 font-mono text-[11px] font-bold text-[#6B6B6B] hover:text-[#F5F4F0]"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={secondsLeft <= 0}
            className={cn(
              "rounded-sm bg-signal py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A]",
              secondsLeft <= 0 && "cursor-not-allowed opacity-40",
            )}
          >
            {secondsLeft <= 0 ? "ENDED" : "CONFIRM BUY"}
          </button>
        </div>
      </div>
    </div>
  );
}
