"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Gift, Gavel, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { PageBackground } from "@/components/reactbits/page-background";
import { NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { useQueryClient } from "@tanstack/react-query";
import { nftPortfolioKey } from "@/components/nft/use-nft-portfolio";
import { fetchCollections, fetchListableNfts, type CollectionData, type OwnedAsset } from "@/lib/solana/nft-data";
import { handleToMint, launchedMeta, myCreatedTokens } from "@/lib/solana/registry";
import { solUsd } from "@/lib/solana/sol-usd";
import { appOrigin, explorerTx } from "@/lib/solana/config";
import { Notice } from "@/components/ui/notice";
import { ConfirmGate, useConfirmGate } from "@/components/ui/confirm-gate";

const DURATION_SEC: Record<string, number> = { "6h": 21_600, "12h": 43_200, "24h": 86_400, "48h": 172_800 };

type Kind = "genesis" | "auction" | "nft";

const KINDS: {
  id: Kind;
  name: string;
  tag: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "nft",
    name: "Standalone NFT",
    tag: "COLLECTIBLE",
    desc: "Mint a plain collectible with its own artwork — no auction, no fee-share. A pure 1-of-1 minted straight to your wallet.",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    id: "genesis",
    name: "Genesis (fee-share)",
    tag: "TRANSFERABLE",
    desc: "Issue NFTs that earn a pro-rata cut of your token's fee stream, forever. Holders claim as fees accrue.",
    icon: <Gift className="h-4 w-4" />,
  },
  {
    id: "auction",
    name: "1-of-1 auction",
    tag: "DUTCH",
    desc: "List a rare asset you own via descending Dutch auction — the price falls until someone buys. No front-running.",
    icon: <Gavel className="h-4 w-4" />,
  },
];

const STEPS = ["Type", "Configure", "Review", "Confirm"];
const DURATIONS = ["6h", "12h", "24h", "48h"];

export function NftCreateFlow() {
  const { connected, address, shortAddress } = useWallet();
  const program = useProgram();
  // Tokens this wallet launched (client-only; localStorage) — the ones it can
  // issue genesis fee-share NFTs for, now that genesis is creator-gated on-chain.
  const [myTokens, setMyTokens] = useState<{ handle: string; symbol: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tokens = address ? await myCreatedTokens(address) : [];
      if (!cancelled) {
        setMyTokens(tokens.map((t) => ({ handle: t.handle, symbol: t.symbol ?? t.handle.slice(0, 4).toUpperCase() })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("nft");
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  // genesis config
  const [tokenHandle, setTokenHandle] = useState("");
  const [sharePct, setSharePct] = useState("1.0");
  const [supply, setSupply] = useState("100");
  // Optional subject artwork for genesis NFTs; empty keeps the fee-share palette.
  const [genesisImage, setGenesisImage] = useState("");
  // auction config
  const [assetId, setAssetId] = useState("");
  const [startUsd, setStartUsd] = useState("10000");
  const [floorUsd, setFloorUsd] = useState("2500");
  const [duration, setDuration] = useState("24h");
  // standalone nft config
  const [nftName, setNftName] = useState("");
  const [nftImage, setNftImage] = useState("");
  const [listForSale, setListForSale] = useState(false);
  // collection config — a mint may join one collection the wallet controls.
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [collection, setCollection] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const readProgram = useReadonlyProgram();
  const queryClient = useQueryClient();
  // Bumped after a successful create so the list re-reads without a callback
  // indirection the effect lint can't see through.
  const [collectionsNonce, setCollectionsNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = address
        ? await fetchCollections(readProgram, new PublicKey(address)).catch(() => [])
        : [];
      if (!cancelled) setCollections(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, readProgram, collectionsNonce]);

  /**
   * Create a Core collection owned by this wallet. The collection account is a
   * fresh keypair that signs its own creation, so it can't be a PDA and has to
   * be generated client-side.
   */
  async function createCollection() {
    if (!program || !address) return setWalletOpen(true);
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    setTxErr(null);
    try {
      const kp = Keypair.generate();
      await program.methods
        .createCollection(name.slice(0, 64), "")
        .accounts({ payer: new PublicKey(address), collection: kp.publicKey })
        .signers([kp])
        .rpc();
      setNewCollectionName("");
      // Select it immediately — creating one is only ever a prelude to using it.
      setCollection(kp.publicKey.toBase58());
      setCollectionsNonce((n) => n + 1);
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Could not create collection");
    } finally {
      setCreatingCollection(false);
    }
  }

  // Collectibles the wallet actually holds. This used to list mock perk and
  // genesis entries, and picking one minted a *new* asset named after it while
  // the real one stayed put — so nothing the user selected was ever listed.
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = address
        ? await fetchListableNfts(readProgram, new PublicKey(address)).catch(() => [])
        : [];
      if (!cancelled) setOwnedAssets(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, readProgram]);
  const pickedAsset = ownedAssets.find((a) => a.asset === assetId) ?? null;

  const kindMeta = KINDS.find((k) => k.id === kind)!;

  /**
   * The externally-hosted artwork URL this mint would bake in, if any.
   *
   * Null when the creator supplied nothing — then the asset points at our own
   * dynamic card, which stays under our control and can be restyled. Only a
   * URL we can't repair is worth gating on.
   */
  const customArtwork: string | null =
    kind === "genesis"
      ? genesisImage.trim() || null
      : kind === "nft"
        ? nftImage.trim() || null
        : null;

  /**
   * Whether the artwork URL will be beyond the minter's reach after this.
   *
   * mint_nft and mint_genesis both hand update authority back to the minter,
   * so those URIs stay repointable — which is exactly what
   * scripts/repair-nft-uri.ts relies on. start_nft_auction does not: it sets
   * the auction PDA as update authority, and no instruction exists to update
   * an asset held there. Only that case is genuinely one-way.
   */
  const uriIsPermanent = kind === "auction" || (kind === "nft" && listForSale);
  const artworkGate = useConfirmGate();

  // The ticker reads better than the handle where we have one; the handle is
  // always available once a token is picked, so this never falls through to
  // nothing.
  const genesisSubject = tokenHandle
    ? launchedMeta(tokenHandle)?.symbol
      ? `$${launchedMeta(tokenHandle)!.symbol}`
      : `@${tokenHandle}`
    : null;

  // What the confirm step previews.
  const previewData: NftCardData =
    kind === "nft"
      ? { kind: "custom", name: nftName, image: nftImage || undefined }
      : kind === "genesis"
      ? {
          kind: "genesis",
          shareBps: Math.max(1, Math.round(+sharePct * 100)),
          id: "GEN-0001",
          // The preview names the token the NFT will pay from, because that's
          // the commitment being made — a card showing a bare percentage lets
          // someone mint a fee share and only afterwards find out of what.
          ...(genesisSubject ? { subject: genesisSubject } : {}),
          ...(genesisImage.trim() ? { image: genesisImage.trim() } : {}),
        }
      : {
          kind: "custom",
          name: pickedAsset?.name ?? "Select an asset",
          ...(pickedAsset?.uri ? { image: pickedAsset.uri } : {}),
        };
  // Standalone NFTs can optionally list into the same Dutch-auction escrow
  // the "1-of-1 auction" kind uses — same start_nft_auction call, since it
  // already mints-and-escrows in one instruction.
  const willList = kind === "auction" || (kind === "nft" && listForSale);
  const validPricing = +startUsd > +floorUsd && +floorUsd > 0;
  const validNft = nftName.trim() !== "" && (!listForSale || validPricing);
  // The program accepts an over-allocated pool and handles it coherently —
  // fees divide across whatever the total is. It just means each NFT pays less
  // than the share printed on it. That's a promise this flow shouldn't let a
  // creator make by accident, so the guard lives here rather than on-chain.
  const validGenesis =
    tokenHandle !== "" && +sharePct > 0 && +supply > 0 && +sharePct * +supply <= 100;
  const validAuction = assetId !== "" && validPricing;
  const canContinue =
    step !== 1 || (kind === "nft" ? validNft : kind === "genesis" ? validGenesis : validAuction);

  async function mint() {
    if (!program || !address) return setWalletOpen(true);
    setTxErr(null);
    setTx("pending");
    try {
      const asset = Keypair.generate();
      const me = new PublicKey(address);
      // An mpl-core `uri` is written once at mint and only the update authority
      // can ever change it, so an empty one is a permanently blank NFT — no
      // image, no attributes, nothing for a wallet to fetch. Two genesis assets
      // were minted that way before this existed. Artwork stays optional; when
      // it's omitted the asset points at the dynamic card instead of nowhere.
      const customUri = (image: string) =>
        image.trim() || `${appOrigin()}/api/nft/custom/${asset.publicKey.toBase58()}`;

      let sig: string;
      if (kind === "nft" && listForSale) {
        const toLamports = (usd: string) => new BN(Math.round(((+usd || 0) / solUsd()) * 1e9));
        sig = await program.methods
          .startNftAuction(
            toLamports(startUsd),
            toLamports(floorUsd),
            new BN(DURATION_SEC[duration] ?? 86_400),
            nftName.slice(0, 64),
            customUri(nftImage).slice(0, 200),
          )
          .accounts({ creator: me, asset: asset.publicKey })
          .signers([asset])
          .rpc();
      } else if (kind === "nft") {
        sig = await program.methods
          .mintNft(nftName.slice(0, 64), customUri(nftImage).slice(0, 200))
          .accounts({
            payer: me,
            recipient: me,
            asset: asset.publicKey,
            // Joining a collection is a mint-time decision for Core; passing
            // null mints a standalone asset.
            collection: collection ? new PublicKey(collection) : null,
          })
          .signers([asset])
          .rpc();
      } else if (kind === "genesis") {
        const subjectMint = handleToMint(tokenHandle);
        if (!subjectMint) throw new Error("Launch this token on-chain first, then issue genesis NFTs.");
        const shareBps = Math.max(1, Math.round((+sharePct || 0) * 100));
        // Point the asset at the dynamic metadata endpoint so the genesis card
        // can be restyled later without a transaction. A creator-supplied
        // image wins — that's a deliberate choice of artwork, not a default.
        //
        // appOrigin() rather than window.location.origin: this string is
        // written on-chain permanently, so minting from a preview deployment
        // would pin the asset to a hostname that outlives the preview.
        const genesisUri =
          genesisImage.trim() || `${appOrigin()}/api/nft/genesis/${asset.publicKey.toBase58()}`;
        sig = await program.methods
          .mintGenesis(shareBps, genesisUri.slice(0, 200))
          .accounts({ authority: me, recipient: me, subjectMint, asset: asset.publicKey })
          .signers([asset])
          .rpc();
      } else {
        // list_nft_auction escrows an asset that already exists, rather than
        // start_nft_auction's mint-a-new-one — which is what "list an asset you
        // own" has to mean.
        if (!pickedAsset) throw new Error("Select an asset to list.");
        const toLamports = (usd: string) => new BN(Math.round(((+usd || 0) / solUsd()) * 1e9));
        sig = await program.methods
          .listNftAuction(
            toLamports(startUsd),
            toLamports(floorUsd),
            new BN(DURATION_SEC[duration] ?? 86_400),
          )
          .accountsPartial({
            creator: me,
            asset: new PublicKey(pickedAsset.asset),
            collection: pickedAsset.collection ? new PublicKey(pickedAsset.collection) : null,
          })
          .rpc();
      }
      setTxSig(sig);
      setTx("confirmed");
      // The credential now exists on-chain; every surface reading the wallet's
      // portfolio should say so without waiting for its own poll.
      void queryClient.invalidateQueries({ queryKey: nftPortfolioKey(address) });
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transaction failed");
      setTx("failed");
    }
  }

  if (!connected) {
    return (
      <Shell>
        <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8 text-center">
          <div className="text-[15px] font-bold">
            Connect a wallet to create
          </div>
          <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-[#6B6B6B]">
            Issuing genesis NFTs or listing a 1-of-1 requires the wallet that
            owns the asset.
          </p>
          <button
            onClick={() => setWalletOpen(true)}
            className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]">
            Connect Wallet
          </button>
        </div>
        <WalletConnectModal
          open={walletOpen}
          onClose={() => setWalletOpen(false)}
        />
      </Shell>
    );
  }

  return (
    <Shell shortAddress={shortAddress}>
      {/* progress */}
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              i <= step ? "bg-signal" : "bg-white/10",
            )}
          />
        ))}
      </div>
      <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
        Step {step + 1} · {STEPS[step]}
      </div>

      {/* min-height keeps the step body a consistent size so the Back/CONTINUE
          nav doesn't jump when a short step (Review) follows a tall one */}
      <div className="mt-4 min-h-[420px]">
        {/* 1 — type */}
        {step === 0 && (
          <div className="flex flex-col gap-2.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "rounded-sm border p-4 text-left transition-colors",
                  kind === k.id
                    ? "border-signal bg-signal/[0.06]"
                    : "border-white/[0.08] hover:border-white/20",
                )}>
                <div className="flex items-center gap-2">
                  <span className="text-signal">{k.icon}</span>
                  <span className="text-[13px] font-bold">{k.name}</span>
                  <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 font-mono text-[8px] text-[#6B6B6B]">
                    {k.tag}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#9aa4af]">
                  {k.desc}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* 2 — configure */}
        {step === 1 && kind === "nft" && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Configure NFT</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              A plain 1-of-1 collectible minted straight to your wallet.
            </p>
            <Field label="Name">
              <input
                value={nftName}
                onChange={(e) => setNftName(e.target.value.slice(0, 64))}
                placeholder="e.g. Founder Badge #1"
                className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none placeholder:text-[#4b5563]"
              />
            </Field>
            <Field label="Image URL (optional)">
              <input
                value={nftImage}
                onChange={(e) => setNftImage(e.target.value.slice(0, 200))}
                placeholder="https://…/art.png"
                className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[12px] outline-none placeholder:text-[#4b5563]"
              />
            </Field>
            {nftImage && (
              <div className="mt-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={nftImage} alt="preview" className="h-28 w-28 rounded-md border border-white/10 object-cover" />
              </div>
            )}

            {/* The artwork decision is the one thing on this screen that can't
                be revised later, so it gets said next to the field rather than
                three steps away on Confirm. */}
            <div className="mt-3">
              {nftImage.trim() ? (
                uriIsPermanent ? (
                  <Notice tone="danger" title="THIS LINK CAN'T BE CHANGED LATER">
                    Listing mints the asset into the auction escrow, which becomes its update
                    authority — so unlike an NFT you mint to yourself, you won&apos;t be able to
                    repoint this URL afterwards. If the host stops serving the file, the NFT is
                    blank in every wallet. Use a URL you control and intend to keep.
                  </Notice>
                ) : (
                  <Notice tone="caution" title="USE A URL YOU INTEND TO KEEP">
                    Written into the asset at mint. You keep update authority on what you mint to
                    yourself, so this can be repointed later — but only by you, and only while you
                    hold that key. If the host stops serving the file before then, the NFT is blank
                    in every wallet.
                  </Notice>
                )
              ) : (
                <Notice tone="info" title="NO ARTWORK? THAT'S FINE">
                  Leave this blank and the NFT points at an AttentionFi card rendered from its
                  on-chain name — which we can restyle later. Supplying your own URL is harder to
                  undo
                  and can&apos;t be undone.
                </Notice>
              )}
            </div>

            {/* Collection membership is fixed at mint time by Core, so it has
                to be chosen here rather than added afterwards. */}
            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <div className="text-[12px] font-bold">Collection</div>
              {listForSale ? (
                // start_nft_auction mints and escrows in one instruction and
                // takes no collection account, so the two can't be combined.
                <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
                  Not available when listing at mint — the listing instruction mints the
                  asset itself and takes no collection. To do both, turn this off, mint
                  into a collection, then list it from the{" "}
                  <Link href="/nft/auctions" className="text-signal">
                    1-of-1 Auctions
                  </Link>{" "}
                  page.
                </p>
              ) : (
              <>
              <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
                Optional. Assets in a collection get the stacked-deck treatment in the
                marketplace and share one on-chain parent.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCollection(null)}
                  className={cn(
                    "rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-colors",
                    collection === null
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-white/10 text-[#6B6B6B] hover:border-white/25",
                  )}
                >
                  None
                </button>
                {collections.map((c) => (
                  <button
                    key={c.address}
                    type="button"
                    onClick={() => setCollection(c.address)}
                    className={cn(
                      "rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-colors",
                      collection === c.address
                        ? "border-signal bg-signal/10 text-signal"
                        : "border-white/10 text-[#6B6B6B] hover:border-white/25",
                    )}
                  >
                    {c.name} <span className="opacity-60">· {c.size}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value.slice(0, 64))}
                  placeholder="New collection name"
                  className="min-w-0 flex-1 rounded-sm border border-white/10 bg-[#12181f] px-3 py-2 text-[12px] outline-none placeholder:text-[#4b5563]"
                />
                <button
                  type="button"
                  onClick={() => void createCollection()}
                  disabled={creatingCollection || newCollectionName.trim() === ""}
                  className="shrink-0 rounded-sm border border-signal/40 bg-signal/10 px-3 py-2 font-mono text-[11px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {creatingCollection ? "CREATING…" : "CREATE"}
                </button>
              </div>
              </>
              )}
            </div>

            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <label className="flex items-center justify-between">
                <span className="text-[12px] font-bold">List for sale</span>
                <button
                  type="button"
                  onClick={() => setListForSale((v) => !v)}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    listForSale ? "bg-signal" : "bg-white/15",
                  )}>
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[#0A0A0A] transition-transform",
                      listForSale ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </button>
              </label>
              <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
                {listForSale
                  ? "Mints straight into a descending Dutch auction — live in the marketplace immediately."
                  : "Off: mints straight to your wallet. Turn on to set a standard and floor price and list it now."}
              </p>

              {listForSale && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Standard price ($)">
                      <input
                        value={startUsd}
                        onChange={(e) => setStartUsd(e.target.value.replace(/[^0-9]/g, ""))}
                        inputMode="numeric"
                        className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                      />
                    </Field>
                    <Field label="Floor price ($)">
                      <input
                        value={floorUsd}
                        onChange={(e) => setFloorUsd(e.target.value.replace(/[^0-9]/g, ""))}
                        inputMode="numeric"
                        className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                      />
                    </Field>
                  </div>
                  {+floorUsd >= +startUsd && (
                    <div className="mt-1 font-mono text-[10px] text-noise">
                      Floor must be below the standard price.
                    </div>
                  )}
                  <Field label="Duration">
                    <div className="flex gap-1.5">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          onClick={() => setDuration(d)}
                          className={cn(
                            "rounded-sm border px-3 py-1.5 font-mono text-[11px]",
                            duration === d
                              ? "border-signal text-signal"
                              : "border-white/10 text-[#9aa4af]",
                          )}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
            </div>
          </div>
        )}

        {step === 1 && kind === "genesis" && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Configure genesis</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              Each NFT earns its share of every fee your token collects, split
              pro-rata.
            </p>
            <Field label="Token you created">
              {myTokens.length ? (
                <select
                  value={tokenHandle}
                  onChange={(e) => setTokenHandle(e.target.value)}
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none">
                  <option value="">Select a token…</option>
                  {myTokens.map((c) => (
                    <option key={c.handle} value={c.handle}>
                      @{c.handle} (${c.symbol})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-noise">
                  You haven&apos;t launched a token yet — launch one, then issue its genesis shares.
                </p>
              )}
            </Field>
            <Field label="Token image (optional)">
              <input
                value={genesisImage}
                onChange={(e) => setGenesisImage(e.target.value.slice(0, 200))}
                placeholder="https://…/token.png"
                className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[12px] outline-none placeholder:text-[#4b5563]"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
                Puts your token&apos;s artwork on the NFT and tints the card to match. Leave it
                empty to keep the standard fee-share colours.
              </p>
            </Field>
            {genesisImage && (
              <div className="mt-1 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={genesisImage}
                  alt="token artwork preview"
                  className="h-24 w-24 rounded-md border border-white/10 object-cover"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Share per NFT (%)">
                <input
                  value={sharePct}
                  onChange={(e) =>
                    setSharePct(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  inputMode="decimal"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
              <Field label="Supply">
                <input
                  value={supply}
                  onChange={(e) =>
                    setSupply(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
            </div>
            <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
              Total allocated: {(+sharePct * +supply || 0).toFixed(1)}% of the
              fee stream
              {+sharePct * +supply > 100 && (
                <span className="text-noise"> · exceeds 100%</span>
              )}
            </div>

            {/* Over-allocating isn't rejected on-chain and doesn't break
                anything — fees are split across whatever the total happens to
                be. What it breaks is the promise: the per-NFT number stops
                meaning what it says, and only the arithmetic reveals it. */}
            <div className="mt-3">
              {+sharePct * +supply > 100 ? (
                <Notice tone="caution" title="EACH NFT WOULD EARN LESS THAN ITS STATED SHARE">
                  Fees divide across the total allocation, so at{" "}
                  {(+sharePct * +supply || 0).toFixed(1)}% each holder would receive roughly{" "}
                  {((+sharePct / (+sharePct * +supply || 1)) * 100).toFixed(2)}% of the stream, not{" "}
                  {sharePct}%. Nothing is lost or over-paid and the program accepts this happily —
                  but the NFT would advertise a share it never pays, so this flow won&apos;t mint
                  it. Reduce the share or the supply until the total is 100% or less.
                </Notice>
              ) : (
                <Notice tone="info" title="HOW THE FEE SHARE WORKS">
                  Every trade on @{tokenHandle || "your token"} deposits fees into a pool. Holders
                  accrue continuously and claim whenever they like — a genesis NFT sold on
                  secondary carries the earning right with it, and only fees deposited after a
                  mint are claimable by it.
                </Notice>
              )}
            </div>
          </div>
        )}

        {step === 1 && kind === "auction" && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Configure auction</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              The price descends from start to floor over the duration. First
              buyer wins.
            </p>
            <Field label="Asset to list">
              {ownedAssets.length ? (
                <select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none">
                  <option value="">Select an asset…</option>
                  {ownedAssets.map((a) => (
                    <option key={a.asset} value={a.asset}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-noise">
                  You don&apos;t own any listable NFTs yet.
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start price ($)">
                <input
                  value={startUsd}
                  onChange={(e) =>
                    setStartUsd(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
              <Field label="Floor price ($)">
                <input
                  value={floorUsd}
                  onChange={(e) =>
                    setFloorUsd(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
            </div>
            {+floorUsd >= +startUsd && (
              <div className="mt-1 font-mono text-[10px] text-noise">
                Floor must be below the start price.
              </div>
            )}
            <Field label="Duration">
              <div className="flex gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      "rounded-sm border px-3 py-1.5 font-mono text-[11px]",
                      duration === d
                        ? "border-signal text-signal"
                        : "border-white/10 text-[#9aa4af]",
                    )}>
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* 3 — review */}
        {step === 2 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Review</div>
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <div className="w-44 max-w-full shrink-0">
                <NftCardFace data={previewData} />
              </div>
              <dl className="flex w-full flex-1 flex-col gap-2.5 font-mono text-[12px]">
              {(kind === "nft"
                ? [
                    ["Type", kindMeta.name],
                    ["Name", nftName],
                    ["Artwork", nftImage ? "provided" : "none"],
                    ...(listForSale
                      ? ([
                          ["Standard price", `$${(+startUsd).toLocaleString()}`],
                          ["Floor price", `$${(+floorUsd).toLocaleString()}`],
                          ["Duration", duration],
                        ] as const)
                      : []),
                    ["Standard", "Metaplex Core"],
                  ]
                : kind === "genesis"
                ? [
                    ["Type", kindMeta.name],
                    ["Token", `@${tokenHandle}`],
                    ["Share per NFT", `${sharePct}%`],
                    ["Supply", supply],
                    [
                      "Total allocated",
                      `${(+sharePct * +supply || 0).toFixed(1)}%`,
                    ],
                    ["Standard", "Metaplex Core"],
                  ]
                : [
                    ["Type", kindMeta.name],
                    ["Asset", assetId],
                    ["Start price", `$${(+startUsd).toLocaleString()}`],
                    ["Floor price", `$${(+floorUsd).toLocaleString()}`],
                    ["Duration", duration],
                    ["Standard", "Metaplex Core"],
                  ]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between border-b border-white/[0.06] pb-2 last:border-0">
                  <span className="text-[#6B6B6B]">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              </dl>
            </div>
          </div>
        )}

        {/* 4 — confirm */}
        {step === 3 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Confirm</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              {kind === "genesis"
                ? `Minting ${supply} genesis NFTs at ${sharePct}% each for @${tokenHandle}.`
                : willList
                  ? `Listing ${kind === "nft" ? nftName || "your NFT" : assetId} from $${(+startUsd).toLocaleString()} down to $${(+floorUsd).toLocaleString()} over ${duration}.`
                  : `Minting ${nftName || "your NFT"} straight to your wallet.`}
            </p>

            {/* preview + params */}
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <div className="w-44 max-w-full shrink-0">
                <NftCardFace data={previewData} />
              </div>
              <dl className="flex w-full flex-1 flex-col gap-1.5 font-mono text-[11px]">
                {(kind === "genesis"
                  ? [
                      ["Token", `@${tokenHandle}`],
                      ["Share / NFT", `${sharePct}%`],
                      ["Supply", supply],
                      [
                        "Allocated",
                        `${(+sharePct * +supply || 0).toFixed(1)}%`,
                      ],
                    ]
                  : kind === "nft"
                    ? [
                        ["Name", nftName],
                        ...(willList
                          ? ([
                              ["Standard", `$${(+startUsd).toLocaleString()}`],
                              ["Floor", `$${(+floorUsd).toLocaleString()}`],
                              ["Duration", duration],
                            ] as const)
                          : ([["Destination", "Your wallet"]] as const)),
                      ]
                    : [
                        ["Asset", assetId],
                        ["Start", `$${(+startUsd).toLocaleString()}`],
                        ["Floor", `$${(+floorUsd).toLocaleString()}`],
                        ["Duration", duration],
                      ]
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between border-b border-white/[0.06] pb-1.5">
                    <span className="text-[#6B6B6B]">{k}</span>
                    <span className="truncate pl-2 text-[#F5F4F0]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-0.5">
                  <span className="text-[#6B6B6B]">Network fee</span>
                  <span className="text-[#F5F4F0]">~0.002 SOL</span>
                </div>
              </dl>
            </div>

            {/* auction price decay preview */}
            {willList && (
              <div className="mt-4 rounded-sm border border-white/[0.06] bg-[#12181f] p-3">
                <div className="flex justify-between font-mono text-[9px] text-[#6B6B6B]">
                  <span>${(+startUsd).toLocaleString()} now</span>
                  <span>
                    ${(+floorUsd).toLocaleString()} at {duration}
                  </span>
                </div>
                <div className="mt-2 h-8 w-full">
                  <svg
                    viewBox="0 0 100 32"
                    preserveAspectRatio="none"
                    className="h-full w-full">
                    <defs>
                      <linearGradient id="decay" x1="0" x2="1">
                        <stop
                          offset="0"
                          stopColor="#00ff85"
                          stopOpacity="0.5"
                        />
                        <stop
                          offset="1"
                          stopColor="#00ff85"
                          stopOpacity="0.08"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,3 L100,29"
                      stroke="url(#decay)"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      d="M0,3 L100,29 L100,32 L0,32 Z"
                      fill="url(#decay)"
                      opacity="0.25"
                    />
                  </svg>
                </div>
                <div className="font-mono text-[9px] text-[#4b5563]">
                  price descends linearly · first buyer wins
                </div>
              </div>
            )}

            {/* what happens */}
            <div className="mt-4 rounded-sm border border-white/[0.06] bg-[#12181f] p-3 text-[11px] leading-relaxed text-[#6B6B6B]">
              {kind === "genesis"
                ? `On confirm, a Metaplex Core genesis NFT mints to your wallet at ${sharePct}% and a fee-share pool opens for @${tokenHandle}. Holders accrue their share of every trade fee and claim any time. (Batch minting of ${supply} comes later.)`
                : willList
                  ? `On confirm, a Metaplex Core 1-of-1 is minted into the auction PDA and the descending price starts. It transfers to the first buyer automatically; you can cancel before a sale.`
                  : `On confirm, a Metaplex Core 1-of-1 mints straight to your wallet — no escrow, no listing. List it for sale any time from the marketplace.`}
            </div>

            {tx ? (
              <div className="mt-4">
                <TxStatus
                  onDismiss={() => setTx(null)}
                  state={tx}
                  title={
                    tx === "pending"
                      ? kind === "genesis"
                        ? "Minting genesis…"
                        : willList
                          ? "Listing asset…"
                          : "Minting…"
                      : tx === "failed"
                        ? "Transaction failed"
                        : kind === "genesis"
                          ? "Genesis minted"
                          : willList
                            ? "Auction live"
                            : "NFT minted"
                  }
                  detail={
                    tx === "failed" && txErr
                      ? txErr.slice(0, 90)
                      : kind === "genesis"
                        ? `@${tokenHandle} · genesis`
                        : willList
                          ? `${kind === "nft" ? nftName || "1-of-1" : assetId || "1-of-1"} · ${duration}`
                          : `${nftName || "1-of-1"} · your wallet`
                  }
                  signature={txSig ? `${txSig.slice(0, 4)}…${txSig.slice(-4)}` : undefined}
                  explorerUrl={txSig ? explorerTx(txSig) : undefined}
                  onRetry={tx === "failed" ? mint : undefined}
                />
                {tx === "confirmed" && (
                  <Link
                    href="/nft"
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-sm border border-signal/40 py-2.5 font-mono text-[11px] font-bold text-signal">
                    <Check className="h-3.5 w-3.5" /> View in NFTs
                  </Link>
                )}
              </div>
            ) : (
              <>
                {/* Only a self-hosted artwork URL earns a gate. Minting itself
                    is ordinary, and the fallback card is permanent in a way we
                    can still restyle — but an external link is a dependency the
                    holder can never repair. */}
                {customArtwork && uriIsPermanent && (
                  <ConfirmGate
                    className="mt-4"
                    title="ARTWORK CANNOT BE CHANGED AFTER LISTING"
                    consequence={
                      <>
                        This asset will point at <span className="break-all">{customArtwork}</span>{" "}
                        for as long as it exists. Listing puts it under the auction escrow&apos;s
                        update authority, so neither you nor AttentionFi can repoint it afterwards
                        — if that URL stops resolving, the NFT is permanently blank.
                      </>
                    }
                    acknowledgement="I control this URL and understand it can't be changed once listed."
                    checked={artworkGate.acknowledged}
                    onChange={artworkGate.setAcknowledged}
                  />
                )}
                <button
                  onClick={mint}
                  disabled={customArtwork !== null && uriIsPermanent && !artworkGate.acknowledged}
                  className="mt-4 w-full rounded-sm bg-signal py-3 font-mono text-[13px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40">
                  {kind === "genesis" ? "MINT GENESIS" : willList ? "START AUCTION" : "MINT NFT"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* nav — no scrim/box; the wizard is centred so it sits right under the card */}
      {step < 3 && (
        <div className="mt-5">
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-sm border border-white/15 px-4 py-3 font-mono text-[12px] font-bold text-[#F5F4F0]">
                Back
              </button>
            )}
            <button
              onClick={() => setStep((s) => Math.min(3, s + 1))}
              disabled={!canContinue}
              className="flex-1 rounded-sm bg-signal py-3 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-40">
              CONTINUE
            </button>
          </div>
        </div>
      )}
      <WalletConnectModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
      />
    </Shell>
  );
}

function Shell({
  children,
  shortAddress,
}: {
  children: React.ReactNode;
  shortAddress?: string | null;
}) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-80 [mask-image:radial-gradient(ellipse_at_center,#000_25%,transparent_85%)]">
        <PageBackground />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col px-5 py-6">
        <div className="flex items-center gap-2">
          <Link href="/nft" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-[15px] font-bold">Create an NFT</span>
          {shortAddress && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/[0.06] px-2.5 py-1 font-mono text-[10px] font-bold text-signal">
              <span className="af-pulse-dot h-1.5 w-1.5 rounded-full bg-signal" />
              {shortAddress}
            </span>
          )}
        </div>
        {/* top-aligned to match the token launch wizard; steps hold a min-height
            so a short step (Review) doesn't shrink sharply vs the others */}
        <div className="py-6">{children}</div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
