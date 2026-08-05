"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { ArrowLeft, BadgeCheck, Gavel, Gift, Layers, Loader2, Lock, Plus, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { NftCard, NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { TiltCard } from "@/components/reactbits/tilt-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";
import { DISCOUNT_PER_LEVEL_BPS, explorerTx, PROGRAM_ID } from "@/lib/solana/config";
import { SkinPicker } from "@/components/nft/skin-picker";
import { AssetSkinPicker } from "@/components/nft/asset-skin-picker";
import { CollectionShelf } from "@/components/nft/collection-shelf";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useNftPortfolio } from "@/components/nft/use-nft-portfolio";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsKey } from "@/components/notifications/use-notifications";
import {
  auctionEnded,
  currentAuctionPrice,
  fetchCollections,
  fetchListableNfts,
  fetchNftAuctions,
  fetchPerkGrant,
  type CollectionData,
  type PerkGrantData,
  type NftPortfolio,
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

export type Section = "verification" | "perk" | "genesis" | "auctions" | "collections";

const MAX_LEVEL = 5;

/** Mirrors PERK_TIERS in nft-card.tsx, indexed by level - 1. */
const PERK_TIER_NAMES = ["Initiate", "Trader", "Pro", "Elite", "Apex"];

const META: Record<Section, { title: string; icon: React.ReactNode }> = {
  verification: { title: "Verification", icon: <Lock className="h-4 w-4" /> },
  perk: { title: "Perk NFTs", icon: <TrendingUp className="h-4 w-4" /> },
  genesis: { title: "Genesis NFTs", icon: <Gift className="h-4 w-4" /> },
  auctions: { title: "1-of-1 Auctions", icon: <Gavel className="h-4 w-4" /> },
  collections: { title: "Collections", icon: <Layers className="h-4 w-4" /> },
};

export function NftManage({ section }: { section: Section }) {
  const { connected, address, shortAddress, disconnect } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [selected, setSelected] = useState<NftCardData | null>(null);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  // Real on-chain credentials, re-read on tab focus so a verification minted
  // on /launch shows up here without a reload.
  const portfolioState = useNftPortfolio();
  const portfolio = portfolioState.data;
  const portfolioStatus = portfolioState.status;

  const readProgram = useReadonlyProgram();
  const queryClient = useQueryClient();
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
  // Mirrors the picker so the badge restyles as soon as a change lands, and
  // shows a loading state while one is in flight.
  const [badgeSkin, setBadgeSkin] = useState<string | null>(null);
  // Mirrors the perk picker so the card restyles the moment a skin lands.
  const [perkSkin, setPerkSkin] = useState<string | null>(null);
  // Keyed by asset: a wallet can hold several genesis NFTs, each skinned
  // independently.
  const [genesisSkins, setGenesisSkins] = useState<Record<string, string | null>>({});
  // A granted-but-unclaimed perk. The grant is an entitlement; claiming is what
  // mints the NFT, and the recipient pays for it.
  const [perkGrant, setPerkGrant] = useState<PerkGrantData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [reclaimingAll, setReclaimingAll] = useState(false);
  const [skinBusy, setSkinBusy] = useState(false);
  const listableAssets = address && listable.owner === address ? listable.assets : [];
  // Collections this wallet is the update authority for.
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [collectionsNonce, setCollectionsNonce] = useState(0);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Re-entering the auctions tab shows a spinner rather than the previous
  // visit's listings. Set during render because from the effect it committed a
  // frame of stale auctions — prices that may already have decayed — before
  // replacing them.
  const [prevSection, setPrevSection] = useState(section);
  if (section !== prevSection) {
    setPrevSection(section);
    if (section === "auctions") setAuctionsStatus("loading");
  }

  // Real 1-of-1 auctions from the chain — only while this section is open.
  useEffect(() => {
    if (section !== "auctions") return;
    let cancelled = false;
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

  // While the wallet still looks unverified, keep checking: the credential is
  // minted elsewhere, so this is the only way it appears without a reload.
  // Stops once it lands, so a verified wallet isn't polling forever. Reads off
  // `portfolio` rather than the derived `verified`, which is declared below.
  const hasVerification = portfolio?.verification != null;
  const refreshPortfolio = portfolioState.refresh;
  useEffect(() => {
    if (section !== "verification" || !address || hasVerification) return;
    const id = setInterval(refreshPortfolio, 15_000);
    return () => clearInterval(id);
  }, [section, address, hasVerification, refreshPortfolio]);

  // Listable collectibles are a separate, wallet-scoped read: it scans every
  // Core asset the wallet owns, so it stays out of the 10s auction poll.
  // Needed by both tabs — the auction lister picks from it, and it's the pool
  // a collection draws candidates from.
  useEffect(() => {
    if ((section !== "auctions" && section !== "collections") || !address) return;
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

  useEffect(() => {
    if (section !== "perk" || !address) return;
    let cancelled = false;
    void (async () => {
      const g = await fetchPerkGrant(readProgram, new PublicKey(address)).catch(() => null);
      if (!cancelled) setPerkGrant(g);
    })();
    return () => {
      cancelled = true;
    };
  }, [section, address, readProgram, portfolioStatus]);

  /** Mint a granted perk. The asset keypair is generated here, so its metadata
   *  URL is known before the mint and can be baked into the asset. */
  async function claimPerk() {
    if (!signProgram || !address || !perkGrant) return setWalletOpen(true);
    setClaiming(true);
    setTx({ state: "pending", title: "Claiming perk…", detail: `Level ${perkGrant.level}` });
    try {
      const asset = Keypair.generate();
      const uri = `${window.location.origin}/api/nft/perk/${asset.publicKey.toBase58()}`;
      const sig = await signProgram.methods
        .claimPerk(uri)
        .accountsPartial({
          recipient: new PublicKey(address),
          granter: new PublicKey(perkGrant.granter),
          asset: asset.publicKey,
        })
        .signers([asset])
        .rpc();
      setTx({
        state: "confirmed",
        title: "Perk claimed",
        detail: `Level ${perkGrant.level} · ${perkGrant.level}% off every trade`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      setPerkGrant(null);
      refreshPortfolio();
      // The grant account closes on claim, so its pinned notification is now
      // stale — drop it rather than leaving it until the next poll.
      void queryClient.invalidateQueries({ queryKey: notificationsKey(address) });
    } catch (e) {
      setTx({
        state: "failed",
        title: "Claim failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setClaiming(false);
    }
  }

  /** Re-read everything the auctions view shows, on demand. */
  async function refreshAuctions() {
    const [list, global] = await Promise.all([
      fetchNftAuctions(readProgram),
      fetchGlobal(readProgram),
    ]);
    setAuctions(list);
    setTreasury(global?.treasury ?? null);
    setAuctionsStatus("ready");
    if (address) {
      const assets = await fetchListableNfts(readProgram, new PublicKey(address)).catch(() => []);
      setListable({ owner: address, assets });
    }
  }

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
    if ((section !== "auctions" && section !== "collections") || !address) return;
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

  /**
   * Reclaim every expired listing of the caller's in as few transactions as
   * possible.
   *
   * A creator who listed a dozen 1-of-1s had to sign a dozen times, one card at
   * a time, to get assets back that were only sitting in escrow because nobody
   * bought them. Six per transaction: each reclaim adds the asset and its
   * auction PDA to the message (payer, system and Core dedupe across the
   * batch), which leaves room under the 1232-byte limit.
   *
   * Partial success is real and reported as such — an early batch can land and
   * a later one fail, so the count says how many actually came back rather
   * than treating the whole run as one outcome.
   */
  async function reclaimAll(list: NftAuctionData[]) {
    if (!signProgram || !address) return setWalletOpen(true);
    const BATCH = 6;
    setReclaimingAll(true);
    setTx({ state: "pending", title: "Reclaiming assets…", detail: `${list.length} listings` });
    let done = 0;
    try {
      const me = new PublicKey(address);
      for (let i = 0; i < list.length; i += BATCH) {
        const slice = list.slice(i, i + BATCH);
        const ixs = await Promise.all(
          slice.map((a) =>
            signProgram.methods
              .reclaimNftAuction()
              .accountsPartial({
                payer: me,
                creator: new PublicKey(a.creator),
                asset: new PublicKey(a.asset),
              })
              .instruction(),
          ),
        );
        const tx = ixs.reduce((t, ix) => t.add(ix), new Transaction());
        await signProgram.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });
        done += slice.length;
        const reclaimed = new Set(slice.map((a) => a.asset));
        setAuctions((prev) =>
          prev.map((x) => (reclaimed.has(x.asset) ? { ...x, complete: true } : x)),
        );
      }
      setTx({
        state: "confirmed",
        title: "Reclaimed",
        detail: `${done} ${done === 1 ? "asset" : "assets"} returned`,
      });
    } catch (e) {
      setTx({
        state: "failed",
        title: done > 0 ? `Reclaimed ${done}, then failed` : "Reclaim failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setReclaimingAll(false);
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

  // Everything below is read from the chain. There is deliberately no mock
  // fallback: showing a connected wallet credentials it doesn't hold is worse
  // than showing an empty state.
  const verified = portfolio?.verification != null;
  const handle = portfolio?.verification?.handle ?? "";
  const level = portfolio?.perk?.level ?? 0;
  const discountBps = portfolio?.perk?.discountBps ?? 0;
  const genesisNfts = portfolio?.genesis ?? [];

  /** Claim accrued fee-share on a genesis NFT. */
  async function claimGenesis(g: NftPortfolio["genesis"][number]) {
    if (!signProgram || !address) return setWalletOpen(true);
    setTx({ state: "pending", title: "Claiming genesis fees…", detail: g.id });
    try {
      // The genesis PDA is seeded by the asset, which isn't one of the
      // instruction's accounts — so Anchor can't resolve it and it has to be
      // derived here. `pool` then resolves from genesis.subject_mint.
      const [genesisPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("genesis"), new PublicKey(g.asset).toBuffer()],
        PROGRAM_ID,
      );
      const sig = await signProgram.methods
        .claimGenesisFee()
        .accountsPartial({
          holder: new PublicKey(address),
          owner: new PublicKey(address),
          genesis: genesisPda,
        })
        .rpc();
      setTx({
        state: "confirmed",
        title: "Claimed",
        detail: `${g.id} · ${sol(g.claimableLamports)} SOL`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      portfolioState.refresh();
    } catch (e) {
      setTx({
        state: "failed",
        title: "Claim failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    }
  }

  if (!connected) {
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
        (portfolioStatus === "loading" ? (
          // Never fall through to "Get verified" before the read lands — that
          // tells a verified wallet it isn't.
          <div className="rounded-sm border border-dashed border-white/12 p-8 text-center font-mono text-[11px] text-[#6B6B6B]">
            Checking this wallet for a verification credential…
          </div>
        ) : verified ? (
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <div className="relative mx-auto w-44 sm:mx-0 sm:w-full">
              <NftCard
                data={{ kind: "verification", handle: handle || "you", skinId: badgeSkin }}
                onClick={() =>
                  setSelected({ kind: "verification", handle: handle || "you", skinId: badgeSkin })
                }
              />
              {/* The new look isn't instant — it spans a wallet prompt, a
                  confirmation and a write — so the card says so instead of
                  sitting on the old art as though nothing happened. */}
              {skinBusy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#0A0A0A]/75 backdrop-blur-[2px]">
                  <Loader2 className="h-5 w-5 animate-spin text-signal" />
                  <span className="px-3 text-center font-mono text-[10px] leading-relaxed text-[#F5F4F0]">
                    Restyling your badge…
                  </span>
                </div>
              )}
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
              {address && (
                <SkinPicker
                  subject={address}
                  onSkinChange={setBadgeSkin}
                  onBusyChange={setSkinBusy}
                />
              )}
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
            {/* Verification runs through X OAuth and a SAS attestation before
                verify_handle will mint. That whole flow lives on the launch
                page; duplicating a handle box here could only be a facsimile
                of it. */}
            <Link
              href="/launch"
              className="mt-4 block w-full rounded-sm bg-signal py-3 text-center font-mono text-[12px] font-bold text-[#0A0A0A]"
            >
              START VERIFICATION →
            </Link>
            <p className="mt-2 text-center font-mono text-[10px] leading-relaxed text-[#4b5563]">
              Takes one wallet signature and an X authorisation. No gas beyond the mint.
            </p>
          </div>
        ))}

      {/* PERK */}
      {section === "perk" &&
        (portfolioStatus === "loading" ? (
          <div className="rounded-sm border border-dashed border-white/12 p-8 text-center font-mono text-[11px] text-[#6B6B6B]">
            Reading this wallet&apos;s on-chain holdings…
          </div>
        ) : level > 0 ? (
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <div className="mx-auto w-44 sm:mx-0 sm:w-full">
              <NftCard
                data={{ kind: "perk", level, discountBps, skinId: perkSkin }}
                onClick={() => setSelected({ kind: "perk", level, discountBps, skinId: perkSkin })}
              />
            </div>
            <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
              <div className="flex items-center gap-2 text-[15px] font-bold text-signal">
                <TrendingUp className="h-5 w-5" /> {PERK_TIER_NAMES[level - 1] ?? "Perk"} · Level{" "}
                {level}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#6B6B6B]">
                Cuts the protocol fee on every trade you make. The discount lives in the
                asset&apos;s on-chain Attributes, which only the program can rewrite — so it
                can&apos;t be edited, and it can&apos;t be sold away from you.
              </p>

              <dl className="mt-4 flex flex-col gap-2 font-mono text-[11px]">
                <Row k="FEE DISCOUNT" v={`${(discountBps / 100).toFixed(0)}% off every trade`} accent />
                <Row k="STANDARD" v="Metaplex Core · Attributes" />
                <Row k="TRANSFERABLE" v="No (soulbound)" />
                <Row k="APPLIES TO" v="Buys, sells and bids" />
                <Row
                  k="NEXT LEVEL"
                  v={
                    level >= MAX_LEVEL
                      ? "Max level reached"
                      : `Level ${level + 1} · ${((discountBps + DISCOUNT_PER_LEVEL_BPS) / 100).toFixed(0)}% off`
                  }
                />
              </dl>

              {/* tier ladder */}
              <div className="mt-4">
                <div className="flex gap-1">
                  {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 flex-1 rounded-full",
                        i < level ? "bg-signal" : "bg-white/10",
                      )}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[#6B6B6B]">
                  <span>Level {level} of {MAX_LEVEL}</span>
                  <span>{(MAX_LEVEL - level) * 1}% more available</span>
                </div>
              </div>

              <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-[#6B6B6B]">
                Levels are granted by the protocol as you complete tasks — they can&apos;t be
                bought or self-minted, which is why a perk is worth holding.
              </p>

              {address && portfolio?.perk && (
                <AssetSkinPicker
                  cls="perk"
                  asset={portfolio.perk.asset}
                  owner={address}
                  onSkinChange={setPerkSkin}
                />
              )}
            </div>
          </div>
        ) : perkGrant ? (
          // Granted but unclaimed: the entitlement exists on-chain and the
          // recipient mints it themselves. Without this the grant was
          // unreachable — nothing in the app called claim_perk.
          <div className="rounded-sm border border-signal/30 bg-signal/[0.04] p-6 text-center">
            <TrendingUp className="mx-auto h-6 w-6 text-signal" />
            <div className="mt-3 text-[15px] font-bold">
              You&apos;ve been granted a Level {perkGrant.level} perk
            </div>
            <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-[#6B6B6B]">
              {PERK_TIER_NAMES[perkGrant.level - 1] ?? "Perk"} · {perkGrant.level}% off every
              trade, forever. Claiming mints it to your wallet — you pay only the network cost
              of the mint, and it&apos;s soulbound once claimed.
            </p>
            <button
              onClick={() => void claimPerk()}
              disabled={claiming}
              className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-50"
            >
              {claiming ? "CLAIMING…" : "CLAIM YOUR PERK"}
            </button>
          </div>
        ) : (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6">
            <TrendingUp className="h-6 w-6 text-signal" />
            <div className="mt-3 text-[14px] font-bold">Perks are earned, not minted</div>
            <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#6B6B6B]">
              A perk cuts the protocol fee on every trade you make — +1% per level, capped at{" "}
              {MAX_LEVEL}%. Because that discount costs the protocol real revenue, perks are
              granted for completing tasks rather than sold: the on-chain instruction only
              accepts the protocol authority as signer, so nobody can mint themselves one.
            </p>
            <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-[#6B6B6B]">
              Once granted, a perk is soulbound to your wallet and its discount is stored in
              on-chain Attributes only the program can rewrite.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {PERK_TIER_NAMES.map((name, i) => (
                <div
                  key={name}
                  className="rounded-sm border border-white/10 px-2.5 py-1.5 font-mono text-[10px] text-[#6B6B6B]"
                >
                  <span className="text-[#F5F4F0]">{name}</span> · {i + 1}% off
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* GENESIS */}
      {section === "genesis" &&
        (portfolioStatus === "loading" ? (
          <div className="rounded-sm border border-dashed border-white/12 p-8 text-center font-mono text-[11px] text-[#6B6B6B]">
            Reading this wallet&apos;s on-chain holdings…
          </div>
        ) : genesisNfts.length ? (
          <div className="flex flex-col gap-3">
            {genesisNfts.map((g) => {
              const card: NftCardData = {
                kind: "genesis",
                shareBps: g.shareBps,
                id: g.id,
                skinId: genesisSkins[g.asset] ?? null,
                ...(g.uri ? { image: g.uri } : {}),
              };
              return (
              <div key={g.asset} className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* w-44, matching the verification badge and the create-flow
                    preview. At the w-28 this used to be, NftCardFace's p-4 left
                    only 80px of content and the share figure printed over the
                    id and the wordmark. */}
                <button onClick={() => setSelected(card)} className="w-44 max-w-full shrink-0 self-center sm:self-auto">
                  <NftCardFace data={card} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[13px] font-bold">{g.id}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#6B6B6B]">{(g.shareBps / 100).toFixed(1)}% revenue share</div>
                  <div className="mt-2 font-mono text-[10px] text-[#6B6B6B]">CLAIMABLE</div>
                  <div className="font-mono text-[18px] font-bold text-signal">{sol(g.claimableLamports)} SOL</div>
                </div>
                <button
                  onClick={() => void claimGenesis(g)}
                  disabled={g.claimableLamports === 0n}
                  className="rounded-sm bg-signal px-5 py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:opacity-40"
                >
                  CLAIM
                </button>
              </div>
              {address && (
                <AssetSkinPicker
                  cls="genesis"
                  asset={g.asset}
                  owner={address}
                  onSkinChange={(id) =>
                    setGenesisSkins((prev) => ({ ...prev, [g.asset]: id }))
                  }
                />
              )}
              </div>
              );
            })}
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

      {section === "collections" && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold">Your collections</h2>
            <RefreshButton onRefresh={() => setCollectionsNonce((n) => n + 1)} />
          </div>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#6B6B6B]">
            A collection is an on-chain parent that assets can belong to — they share it as their
            update authority and get the stacked-deck treatment on their cards. Pick one at mint
            time, or move assets in and out here afterwards.
          </p>

          {collections.length === 0 ? (
            <div className="mt-4 rounded-sm border border-dashed border-white/12 p-8 text-center font-mono text-[11px] text-[#6B6B6B]">
              No collections yet. Create one below, then add NFTs you already hold.
            </div>
          ) : address ? (
            <div className="mt-4 flex flex-col gap-2.5">
              {collections.map((c) => (
                <CollectionShelf
                  key={c.address}
                  collection={c}
                  owner={address}
                  candidates={listableAssets}
                  // Sizes come from the collection account, so a move has to
                  // re-read them or the counts stay one action behind.
                  onChanged={() => setCollectionsNonce((n) => n + 1)}
                />
              ))}
            </div>
          ) : null}

          <h2 className="mt-8 text-[13px] font-bold">New collection</h2>
          <div className="mt-2 flex max-w-md gap-1.5">
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
        </div>
      )}

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
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-bold">Your listings</h2>
                <RefreshButton onRefresh={refreshAuctions} />
              </div>
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
              <AuctionSkeletonGrid count={3} />
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
            {auctionsStatus === "loading" ? (
              <AuctionSkeletonGrid count={3} />
            ) : auctionsStatus === "error" ? (
              <p className="mt-2 rounded-sm border border-dashed border-noise/30 p-5 text-center font-mono text-[11px] text-noise">
                Couldn&apos;t reach the chain to load the market.
              </p>
            ) : market.length === 0 ? (
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


            {expired.length > 0 && (
              <>
                <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[13px] font-bold">Ended without a buyer</h2>
                  {mineExpired.length > 1 && (
                    <button
                      onClick={() => void reclaimAll(mineExpired)}
                      disabled={reclaimingAll}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/10 px-3 py-1.5 font-mono text-[10px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {reclaimingAll && <Loader2 className="h-3 w-3 animate-spin" />}
                      {reclaimingAll
                        ? "RECLAIMING…"
                        : `RECLAIM ALL (${mineExpired.length})`}
                    </button>
                  )}
                </div>
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

/**
 * Placeholder while auctions load.
 *
 * Mirrors AuctionCard's shape — artwork above, detail block below — so the
 * grid doesn't reflow when real listings arrive. The market grid previously
 * rendered empty during the fetch, which read as "no auctions" rather than
 * "not loaded yet".
 */
function AuctionSkeletonGrid({ count }: { count: number }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col">
          <div className="aspect-3/4 animate-pulse rounded-xl bg-white/[0.05]" />
          <div className="mt-3 rounded-sm border border-white/[0.08] bg-[#0f1620] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.07]" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-white/[0.05]" />
            </div>
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-white/[0.07]" />
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]" />
            <div className="mt-2 flex justify-between">
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-white/[0.05]" />
            </div>
            <div className="mt-3 h-8 w-full animate-pulse rounded-sm bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
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
