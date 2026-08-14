import type { Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { NftCardData } from "@/components/nft/nft-card";
import { artworkUrl } from "@/lib/nft-artwork";
import { collectionAuctionPda } from "./program";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
/** mpl-core's `Key` enum discriminant for a plain (non-collection) asset account. */
const KEY_ASSET_V1 = 1;
/** `Key::CollectionV1` — the same enum, variant 5. */
const KEY_COLLECTION_V1 = 5;

/**
 * Decode just enough of a Core `BaseAssetV1` account (borsh: 1-byte key +
 * 32-byte owner + UpdateAuthority enum + name: String + uri: String + ...) to
 * pull its display name/uri/collection — no mpl-core JS SDK needed for a read
 * this narrow. `collection` is set only when UpdateAuthority::Collection(_) —
 * i.e. the asset genuinely belongs to an mpl-core collection, tag byte 2.
 */
export function decodeAsset(data: Buffer): {
  owner: string;
  name: string;
  uri: string;
  collection: string | null;
  /**
   * Whoever may change this asset — Address(pubkey) for a standalone asset, or
   * the collection when it belongs to one.
   *
   * Distinct from `owner`, and the distinction is load-bearing: Core authorises
   * UpdateV2 against the update authority, so an asset you bought is yours to
   * transfer but not yours to move between collections. Offering those in a
   * collection picker produced NoApprovals (0x1a) at simulation.
   */
  updateAuthority: string | null;
} | null {
  try {
    const owner = new PublicKey(data.subarray(1, 33)).toBase58();
    let offset = 1 + 32; // key + owner
    const authorityTag = data.readUInt8(offset);
    offset += 1;
    let collection: string | null = null;
    let updateAuthority: string | null = null;
    if (authorityTag !== 0) {
      const key = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      updateAuthority = key;
      if (authorityTag === 2) collection = key;
      offset += 32; // Address(Pubkey) or Collection(Pubkey)
    }

    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.subarray(offset, offset + uriLen).toString("utf8");

    return { owner, name, uri, collection, updateAuthority };
  } catch {
    return null;
  }
}

/** An mpl-core collection this wallet controls. */
export interface CollectionData {
  address: string;
  name: string;
  uri?: string;
  /** How many assets currently belong to it. */
  size: number;
}

/**
 * Decode a Core `BaseCollectionV1` (borsh: 1-byte key + 32-byte update
 * authority + name: String + uri: String + num_minted: u32 + current_size:
 * u32). Simpler than an asset: the authority is a bare Pubkey here, not the
 * `UpdateAuthority` enum an asset carries.
 */
function decodeCollection(data: Buffer): { name: string; uri: string; size: number } | null {
  try {
    let offset = 1 + 32; // key + update_authority
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.subarray(offset, offset + uriLen).toString("utf8");
    offset += uriLen;

    offset += 4; // num_minted — cumulative, so it overcounts after a burn
    const size = data.readUInt32LE(offset);
    return { name, uri, size };
  } catch {
    return null;
  }
}

/**
 * The assets that belong to `collection`.
 *
 * Membership in Core isn't a list on the collection — it's a property of each
 * asset, whose `UpdateAuthority` is `Collection(address)`. So this reads from
 * the asset side: tag byte 2 sits at offset 33 and the collection pubkey
 * immediately after it, right where a standalone asset would carry its own
 * authority instead.
 *
 * `BaseCollectionV1.current_size` gives the same count more cheaply, which is
 * why the chips use it — this is for showing the members themselves.
 */
export async function fetchCollectionAssets(
  program: Program<AttentionFi>,
  collection: PublicKey,
): Promise<OwnedAsset[]> {
  const accounts = await program.provider.connection.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([KEY_ASSET_V1])) } },
      // 1 key + 32 owner = 33, the UpdateAuthority tag; Collection is variant 2.
      { memcmp: { offset: 33, bytes: bs58.encode(Buffer.from([2])) } },
      { memcmp: { offset: 34, bytes: collection.toBase58() } },
    ],
  });

  const out: OwnedAsset[] = [];
  for (const { pubkey, account } of accounts) {
    const decoded = decodeAsset(account.data);
    if (!decoded) continue;
    out.push({
      asset: pubkey.toBase58(),
      name: decoded.name || short(pubkey.toBase58()),
      uri: decoded.uri || undefined,
      collection: decoded.collection,
      updateAuthority: decoded.updateAuthority,
    });
  }
  return out;
}

/**
 * Collections whose update authority is `authority` — the ones this wallet may
 * mint into. Read by memcmp on mpl-core's account layout, matching the
 * approach used for assets above.
 */
export async function fetchCollections(
  program: Program<AttentionFi>,
  authority: PublicKey,
): Promise<CollectionData[]> {
  const accounts = await program.provider.connection.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([KEY_COLLECTION_V1])) } },
      { memcmp: { offset: 1, bytes: authority.toBase58() } },
    ],
  });

  const out: CollectionData[] = [];
  for (const { pubkey, account } of accounts) {
    const decoded = decodeCollection(account.data);
    if (!decoded) continue;
    out.push({
      address: pubkey.toBase58(),
      name: decoded.name || short(pubkey.toBase58()),
      uri: decoded.uri || undefined,
      size: decoded.size,
    });
  }
  return out;
}

/** A 1-of-1 Dutch auction, read straight from its on-chain `NftAuction` PDA. */
export interface NftAuctionData {
  asset: string;
  creator: string;
  /** Display name from the Core asset (falls back to a short address). */
  name: string;
  /** Artwork URI from the Core asset; undefined when the asset set none. */
  uri?: string;
  startPrice: bigint;
  floorPrice: bigint;
  startTime: number;
  duration: number;
  complete: boolean;
  /** Set only when the listed asset actually belongs to an mpl-core collection. */
  collection: string | null;
  /** Name and size of that collection, when it has one — so a listed member
   *  can say "1 of 8" rather than claiming to be a 1-of-1. */
  collectionMeta?: { name: string; size: number };
}

/**
 * Every listed 1-of-1 auction (open, closed, expired) — filter client-side.
 * Batch-reads each auction's underlying Core asset alongside the PDA fetch so
 * the UI can tell a collection piece from a standalone 1-of-1 (only the
 * former gets the "part of a deck" card treatment).
 */
export async function fetchNftAuctions(program: Program<AttentionFi>): Promise<NftAuctionData[]> {
  const all = await program.account.nftAuction.all();
  if (all.length === 0) return [];

  const assetInfos = await program.provider.connection.getMultipleAccountsInfo(
    all.map((a) => a.account.asset),
  );
  // Keep the whole decode: the asset carries the listing's name and artwork,
  // and dropping them is why listed 1-of-1s rendered as blank default cards.
  const decodedByAsset = new Map<string, ReturnType<typeof decodeAsset>>();
  all.forEach((a, i) => {
    const info = assetInfos[i];
    decodedByAsset.set(a.account.asset.toBase58(), info ? decodeAsset(info.data) : null);
  });

  const meta = await fetchCollectionMeta(
    program,
    [...decodedByAsset.values()].flatMap((d) => (d?.collection ? [d.collection] : [])),
  ).catch(() => new Map<string, { name: string; size: number }>());

  return all.map((a) => {
    const key = a.account.asset.toBase58();
    const decoded = decodedByAsset.get(key) ?? null;
    const collectionMeta = decoded?.collection ? meta.get(decoded.collection) : undefined;
    return {
    asset: key,
    creator: a.account.creator.toBase58(),
    name: decoded?.name || short(key),
    uri: decoded?.uri || undefined,
    startPrice: BigInt(a.account.startPrice.toString()),
    floorPrice: BigInt(a.account.floorPrice.toString()),
    startTime: Number(a.account.startTime.toString()),
    duration: Number(a.account.duration.toString()),
    complete: a.account.complete,
    collection: decoded?.collection ?? null,
    ...(collectionMeta ? { collectionMeta } : {}),
    };
  });
}

/** A collection listed for sale, read from its `CollectionAuction` PDA. */
export interface CollectionAuctionData {
  collection: string;
  creator: string;
  name: string;
  /** Members at read time. The listing sells authority over all of them. */
  size: number;
  startPrice: bigint;
  floorPrice: bigint;
  startTime: number;
  /** Zero means perpetual — no deadline, no descent. */
  duration: number;
  complete: boolean;
}

/**
 * Every collection listing, open or closed — filter client-side, the same way
 * `fetchNftAuctions` does.
 *
 * The collection account is read alongside the PDA because the listing itself
 * knows nothing about what it is selling: a buyer needs the name and, more to
 * the point, the size, since buying the collection buys authority over every
 * member.
 */
export async function fetchCollectionAuctions(
  program: Program<AttentionFi>,
): Promise<CollectionAuctionData[]> {
  const all = await program.account.collectionAuction.all();
  if (all.length === 0) return [];

  const meta = await fetchCollectionMeta(
    program,
    all.map((a) => a.account.collection.toBase58()),
  ).catch(() => new Map<string, { name: string; size: number }>());

  return all.map((a) => {
    const key = a.account.collection.toBase58();
    const info = meta.get(key);
    return {
      collection: key,
      creator: a.account.creator.toBase58(),
      name: info?.name ?? short(key),
      size: info?.size ?? 0,
      startPrice: BigInt(a.account.startPrice.toString()),
      floorPrice: BigInt(a.account.floorPrice.toString()),
      startTime: Number(a.account.startTime.toString()),
      duration: Number(a.account.duration.toString()),
      complete: a.account.complete,
    };
  });
}

/**
 * Current price of a collection listing, mirroring the program's descent.
 *
 * A perpetual listing never moves, which is also why this can't reuse
 * `currentAuctionPrice` unchanged — that clamps duration to a minimum of 1 to
 * avoid dividing by zero, which would make a perpetual listing appear to have
 * already fallen to its floor.
 */
export function collectionPrice(a: CollectionAuctionData, nowMs: number): bigint {
  if (a.duration === 0) return a.startPrice;
  const now = BigInt(Math.floor(nowMs / 1000));
  const start = BigInt(a.startTime);
  const elapsed = now > start ? now - start : 0n;
  const duration = BigInt(a.duration);
  if (elapsed >= duration) return a.floorPrice;
  const span = a.startPrice - a.floorPrice;
  return a.startPrice - (span * elapsed) / duration;
}

/**
 * Whether a listing has run out of time.
 *
 * A perpetual listing (duration 0) never has. Spelled out here rather than
 * compared inline because `startTime + 0` is in the past the moment a listing
 * opens, so the naive comparison reports every perpetual listing as expired.
 */
export function listingEnded(
  a: { startTime: number; duration: number },
  nowMs: number,
): boolean {
  if (a.duration === 0) return false;
  return Math.floor(nowMs / 1000) >= a.startTime + a.duration;
}

/**
 * Current price (lamports) at `nowMs`, mirroring the program's linear descent
 * (`auction.rs::current_price`) so the UI ticks in sync with what the chain
 * will actually charge — price only ever falls, never rises, before it ends.
 */
export function currentAuctionPrice(a: NftAuctionData, nowMs: number): bigint {
  const now = BigInt(Math.floor(nowMs / 1000));
  const start = BigInt(a.startTime);
  const elapsed = now > start ? now - start : 0n;
  const duration = BigInt(Math.max(1, a.duration));
  if (elapsed >= duration) return a.floorPrice;
  const span = a.startPrice - a.floorPrice;
  return a.startPrice - (span * elapsed) / duration;
}

/** True once an auction's window has elapsed, whether or not it sold. */
export function auctionEnded(a: NftAuctionData, nowMs: number): boolean {
  return Math.floor(nowMs / 1000) >= a.startTime + a.duration;
}

/**
 * A plain Core asset held by a wallet, carrying the pubkey needed to act on
 * it. `fetchOwnedNfts` renders to `NftCardData`, which deliberately has no
 * address field — but listing an asset for auction needs one, so the raw form
 * is kept separate rather than widening the card type.
 */
export interface OwnedAsset {
  asset: string;
  name: string;
  uri?: string;
  collection: string | null;
  /** Who may change it — see decodeAsset. Null only for renounced authority. */
  updateAuthority: string | null;
}

/**
 * Standalone `mint_nft` collectibles owned by a wallet — plain Core assets
 * with no AttentionFi PDA of their own, so they're invisible to the
 * program-account queries above. Reads mpl-core's account layout directly
 * (memcmp on key + owner) rather than pulling in the full mpl-core JS SDK.
 * `exclude` filters out assets already surfaced via genesis/perk/verification
 * (those are Core assets too, just ones we already have a richer card for).
 *
 * Assets escrowed in a live auction are owned by the auction PDA, not the
 * wallet, so the owner memcmp already excludes them — no extra filtering.
 */
async function fetchStandaloneAssets(
  program: Program<AttentionFi>,
  owner: PublicKey,
  exclude: Set<string>,
): Promise<OwnedAsset[]> {
  const accounts = await program.provider.connection.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([KEY_ASSET_V1])) } },
      { memcmp: { offset: 1, bytes: owner.toBase58() } },
    ],
  });

  const out: OwnedAsset[] = [];
  for (const { pubkey, account } of accounts) {
    const key = pubkey.toBase58();
    if (exclude.has(key)) continue;
    const decoded = decodeAsset(account.data);
    if (!decoded) continue;
    out.push({
      asset: key,
      name: decoded.name || short(key),
      uri: decoded.uri || undefined,
      collection: decoded.collection,
      updateAuthority: decoded.updateAuthority,
    });
  }
  return out;
}

/**
 * The wallet's program-tracked NFTs, as display cards plus the set of asset
 * addresses they cover. Split out because listing and rendering need the same
 * scan for different halves of its result.
 */
async function fetchProgramNfts(
  program: Program<AttentionFi>,
  ownerStr: string,
): Promise<{
  cards: NftCardData[];
  tracked: Set<string>;
  /** Genesis cards paired with their Core asset, so a caller can enrich them
   *  from the asset account without re-reading every PDA. */
  genesisAssets: { card: NftCardData; asset: PublicKey }[];
}> {
  const [genesis, perks, verifications] = await Promise.all([
    program.account.genesisNft.all(),
    program.account.perkNft.all(),
    program.account.verification.all(),
  ]);

  const cards: NftCardData[] = [];
  const tracked = new Set<string>();
  const genesisAssets: { card: NftCardData; asset: PublicKey }[] = [];
  for (const v of verifications) {
    if (v.account.subject.toBase58() === ownerStr) {
      cards.push({ kind: "verification", handle: v.account.handle });
      tracked.add(v.account.asset.toBase58());
    }
  }
  for (const p of perks) {
    if (p.account.owner.toBase58() === ownerStr) {
      cards.push({ kind: "perk", level: p.account.level, discountBps: p.account.discountBps });
      tracked.add(p.account.asset.toBase58());
    }
  }
  for (const g of genesis) {
    if (g.account.owner.toBase58() === ownerStr) {
      const card: NftCardData = {
        kind: "genesis",
        shareBps: g.account.shareBps,
        id: short(g.account.asset.toBase58()),
      };
      cards.push(card);
      genesisAssets.push({ card, asset: g.account.asset });
      tracked.add(g.account.asset.toBase58());
    }
  }
  return { cards, tracked, genesisAssets };
}

/**
 * The AttentionFi NFTs owned by a wallet, read from the program's PDAs
 * (verification by subject, perk + genesis by owner) plus any standalone
 * collectible Core assets. Maps to NftCardData for the collection grid.
 * Returns [] when the wallet holds none.
 */
/**
 * Name and current size for each of `addresses`, in one round trip.
 *
 * A collection member is still a unique token — what membership changes is
 * that it belongs to a set, and the set's size is only on the collection
 * account. Read in a batch because a wallet holding a whole deck would
 * otherwise fetch the same collection once per card.
 */
export async function fetchCollectionMeta(
  program: Program<AttentionFi>,
  addresses: readonly string[],
): Promise<Map<string, { name: string; size: number }>> {
  const out = new Map<string, { name: string; size: number }>();
  const unique = [...new Set(addresses)];
  if (unique.length === 0) return out;

  const infos = await program.provider.connection.getMultipleAccountsInfo(
    unique.map((a) => new PublicKey(a)),
  );
  for (const [i, info] of infos.entries()) {
    const address = unique[i]!;
    if (!info) continue;
    const decoded = decodeCollection(info.data);
    if (!decoded) continue;
    out.set(address, { name: decoded.name || short(address), size: decoded.size });
  }
  return out;
}

export async function fetchOwnedNfts(program: Program<AttentionFi>, owner: PublicKey): Promise<NftCardData[]> {
  const { cards, tracked, genesisAssets } = await fetchProgramNfts(program, owner.toBase58());
  // Skins live off-chain, so the grid rendered every card in its default
  // palette no matter what the holder was wearing. Applied here rather than in
  // each caller, so every surface showing a collection agrees.
  await applySkins(cards, owner.toBase58());
  const standalone = await fetchStandaloneAssets(program, owner, tracked).catch(() => []);

  // A genesis NFT can be filed into a collection like anything else, but its
  // PDA doesn't record that — only the Core asset does. Without this read the
  // card stayed silent about membership, so filing one looked like it hadn't
  // worked.
  const genesisCollections = new Map<NftCardData, string>();
  if (genesisAssets.length > 0) {
    const infos = await program.provider.connection
      .getMultipleAccountsInfo(genesisAssets.map((g) => g.asset))
      .catch(() => []);
    for (const [i, info] of infos.entries()) {
      if (!info) continue;
      const decoded = decodeAsset(info.data);
      const entry = genesisAssets[i];
      if (!decoded || !entry) continue;
      if (decoded.collection) genesisCollections.set(entry.card, decoded.collection);
      // The same read already has the asset's artwork, and dropping it was why
      // one genesis NFT looked like two different things: /nft built its cards
      // from the Core asset and showed the picture, the profile built them from
      // the PDA alone and fell back to the generated face. A holder seeing a
      // card they'd skinned render blank elsewhere reasonably concludes the
      // skin came off.
      const artwork = artworkUrl(decoded.uri);
      if (artwork && entry.card.kind === "genesis") entry.card.image = artwork;
    }
  }

  // Membership is worth showing on the card, and the size lives on the
  // collection account rather than the asset.
  const meta = await fetchCollectionMeta(program, [
    ...standalone.flatMap((a) => (a.collection ? [a.collection] : [])),
    ...genesisCollections.values(),
  ]).catch(() => new Map<string, { name: string; size: number }>());

  for (const [card, address] of genesisCollections) {
    const collection = meta.get(address);
    if (collection && card.kind === "genesis") card.collection = collection;
  }

  return [
    ...cards,
    ...standalone.map((a) => {
      const collection = a.collection ? meta.get(a.collection) : undefined;
      return {
        kind: "custom" as const,
        name: a.name,
        // artworkUrl, not the raw uri: an asset minted without its own picture
        // points at the metadata document, which renders as nothing in an img.
        image: artworkUrl(a.uri),
        id: short(a.asset),
        ...(collection ? { collection } : {}),
      };
    }),
  ];
}

/**
 * A wallet's AttentionFi credentials, read from the program's PDAs.
 *
 * Distinct from `fetchOwnedNfts`, which flattens everything into display cards:
 * the manage screen needs the structured values (level, share, handle) to drive
 * its detail panels, and needs to distinguish "none" from "not loaded yet".
 */
export interface NftPortfolio {
  verification: { handle: string; asset: string } | null;
  /** Highest-level perk held; the fee discount applied is this one. */
  perk: { level: number; discountBps: number; asset: string } | null;
  genesis: {
    id: string;
    shareBps: number;
    asset: string;
    claimableLamports: bigint;
    /** The token whose fee stream this NFT shares. Already on-chain in both the
     *  GenesisNft PDA and the asset's Attributes — a genesis NFT is a claim on
     *  a *specific* token's fees, so a card that omits it is unreadable. */
    subjectMint: string;
    /** Subject artwork from the Core asset; undefined when the issuer set none. */
    uri?: string;
  }[];
}

/** Matches `revenue::ACC_SCALE` — the accumulator's fixed-point scale. */
const ACC_SCALE = 1_000_000_000_000n;

/**
 * Claimable lamports for a genesis NFT, mirroring `claim_genesis_fee`:
 * `unclaimed + (share_bps * acc_per_share / ACC_SCALE - reward_debt)`.
 *
 * Reading `unclaimed` alone would under-report, since revenue accrued since the
 * holder last interacted is still sitting in the pool accumulator.
 */
function genesisClaimable(
  shareBps: number,
  unclaimed: bigint,
  rewardDebt: bigint,
  accPerShare: bigint,
): bigint {
  const accruedTotal = (BigInt(shareBps) * accPerShare) / ACC_SCALE;
  const pending = accruedTotal > rewardDebt ? accruedTotal - rewardDebt : 0n;
  return unclaimed + pending;
}

export async function fetchNftPortfolio(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<NftPortfolio> {
  const ownerStr = owner.toBase58();
  const [genesis, perks, verifications, pools] = await Promise.all([
    program.account.genesisNft.all(),
    program.account.perkNft.all(),
    program.account.verification.all(),
    // Needed to price the accrual half of each genesis claim.
    program.account.genesisPool.all(),
  ]);
  const accByMint = new Map<string, bigint>();
  for (const p of pools) {
    accByMint.set(p.account.subjectMint.toBase58(), BigInt(p.account.accPerShare.toString()));
  }

  const myGenesis = genesis.filter((g) => g.account.owner.toBase58() === ownerStr);
  // Artwork lives on the Core asset, not the GenesisNft PDA, so it needs a
  // second read — batched into one call rather than one per NFT.
  const genesisAssetInfos =
    myGenesis.length > 0
      ? await program.provider.connection.getMultipleAccountsInfo(
          myGenesis.map((g) => g.account.asset),
        )
      : [];
  const genesisUri = new Map<string, string | undefined>();
  myGenesis.forEach((g, i) => {
    const info = genesisAssetInfos[i];
    genesisUri.set(g.account.asset.toBase58(), info ? decodeAsset(info.data)?.uri || undefined : undefined);
  });

  const mine = verifications.find((v) => v.account.subject.toBase58() === ownerStr);
  const ownedPerks = perks.filter((p) => p.account.owner.toBase58() === ownerStr);
  // A wallet could hold more than one perk; the discount that matters is the
  // best one, so surface that rather than an arbitrary first result.
  const best = ownedPerks.reduce<(typeof ownedPerks)[number] | null>(
    (acc, p) => (acc === null || p.account.level > acc.account.level ? p : acc),
    null,
  );

  return {
    verification: mine
      ? { handle: mine.account.handle, asset: mine.account.asset.toBase58() }
      : null,
    perk: best
      ? {
          level: best.account.level,
          discountBps: best.account.discountBps,
          asset: best.account.asset.toBase58(),
        }
      : null,
    genesis: myGenesis
      .map((g) => ({
        id: short(g.account.asset.toBase58()),
        shareBps: g.account.shareBps,
        asset: g.account.asset.toBase58(),
        subjectMint: g.account.subjectMint.toBase58(),
        uri: genesisUri.get(g.account.asset.toBase58()),
        claimableLamports: genesisClaimable(
          g.account.shareBps,
          BigInt(g.account.unclaimed.toString()),
          BigInt(g.account.rewardDebt.toString()),
          accByMint.get(g.account.subjectMint.toBase58()) ?? 0n,
        ),
      })),
  };
}

/**
 * Paint the holder's chosen skins onto their cards.
 *
 * One request for the whole grid rather than one per card. A failure leaves the
 * default palettes, which is the correct degraded state — the cards are still
 * accurate about what the wallet holds, just not about how it dressed them.
 */
async function applySkins(cards: NftCardData[], owner: string): Promise<void> {
  const perk = cards.find((c) => c.kind === "perk");
  const genesis = cards.filter((c) => c.kind === "genesis");
  const verification = cards.find((c) => c.kind === "verification");
  if (!perk && !verification && genesis.length === 0) return;

  try {
    const res = await fetch(`/api/skins/worn?owner=${owner}`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      verification?: string | null;
      verificationUri?: string | null;
      perkAsset?: string | null;
      assets?: Record<string, { skin: string | null; customUri: string | null }>;
    };
    const assets = body.assets ?? {};

    // The URI travels with the id in every branch below. The signature skin
    // has no palette to look up, so an id on its own leaves the card rendering
    // the default — indistinguishable from not having applied the skin at all.
    if (verification?.kind === "verification") {
      verification.skinId = body.verification ?? null;
      verification.skinUri = body.verificationUri ?? null;
    }
    if (perk?.kind === "perk" && body.perkAsset) {
      perk.skinId = assets[body.perkAsset]?.skin ?? null;
      perk.skinUri = assets[body.perkAsset]?.customUri ?? null;
    }
    // Genesis cards carry a shortened asset id, so match on the same shortening
    // rather than duplicating the format in the API contract.
    for (const [address, sel] of Object.entries(assets)) {
      const card = genesis.find((c) => c.kind === "genesis" && c.id === short(address));
      if (card?.kind === "genesis") {
        card.skinId = sel.skin ?? null;
        card.skinUri = sel.customUri ?? null;
      }
    }
  } catch {
    // Offline / not configured — keep the designed defaults.
  }
}

/**
 * Assets the wallet can put up for auction via `list_nft_auction`.
 *
 * Genesis/perk/verification NFTs are excluded even though they're Core assets
 * the wallet owns: each has a program PDA recording an owner, and escrowing
 * the asset would move it without updating that record, desyncing fee shares
 * and discounts. Only plain collectibles are listable.
 */
export async function fetchListableNfts(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<OwnedAsset[]> {
  const { tracked } = await fetchProgramNfts(program, owner.toBase58());
  return fetchStandaloneAssets(program, owner, tracked);
}

/**
 * Assets a wallet may gather into one of its collections.
 *
 * Wider than [`fetchListableNfts`] on purpose, and the difference matters.
 * That pool feeds listing and burning, where a genesis NFT must never appear —
 * burning one destroys a live claim on a token's fee stream. Collecting one
 * destroys nothing: membership is an `UpdateV2` that moves an asset into a set
 * and can be undone by `remove_from_collection`.
 *
 * Excluding genesis from both meant a creator who had minted fee-share NFTs
 * for their own token could see them in the grid but never file them anywhere
 * — the collection shelf simply had nothing to offer, which reads as the
 * feature being broken rather than the asset being protected.
 *
 * Perk and verification NFTs are left out because they cannot move regardless:
 * Core authorises the update against the asset's update authority, and theirs
 * is a program PDA. Offering them would only produce a failure at submit.
 */
export async function fetchCollectableNfts(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<OwnedAsset[]> {
  const ownerStr = owner.toBase58();
  const genesis = await program.account.genesisNft
    .all()
    .then((all) => all.filter((g) => g.account.owner.toBase58() === ownerStr))
    .catch(() => []);

  const genesisAssets = genesis.map((g) => g.account.asset);
  const { tracked } = await fetchProgramNfts(program, ownerStr);
  const standalone = await fetchStandaloneAssets(program, owner, tracked);

  if (genesisAssets.length === 0) return standalone;

  // Read the Core accounts directly: the PDA knows the claim, only the asset
  // knows its name, art and which collection it currently sits in.
  const infos = await program.provider.connection
    .getMultipleAccountsInfo(genesisAssets)
    .catch(() => []);

  const collectable: OwnedAsset[] = [];
  for (const [i, info] of infos.entries()) {
    if (!info) continue;
    const decoded = decodeAsset(info.data);
    if (!decoded) continue;
    const address = genesisAssets[i]!.toBase58();
    collectable.push({
      asset: address,
      name: decoded.name || short(address),
      uri: decoded.uri || undefined,
      collection: decoded.collection,
      updateAuthority: decoded.updateAuthority,
    });
  }
  return [...standalone, ...collectable];
}

/**
 * A finished listing of the caller's, and how it finished.
 *
 * `NftAuction.complete` is set by both `buy_nft` and `reclaim_nft_auction`, so
 * the flag alone can't say whether a listing sold or simply came back. The
 * asset's current owner settles it: still with the lister means reclaimed,
 * anyone else means sold.
 *
 * Derived from account state rather than events because `buy_nft` emits none —
 * so there is nothing for the indexer to pick up. An `NftSaleEvent` would give
 * this a real timestamp and sale price; until then, outcome is all that's
 * knowable without a per-listing transaction lookup.
 */
export interface NftOutcome {
  asset: string;
  name: string;
  uri?: string;
  outcome: "sold" | "reclaimed";
  /** Present for sales: whoever holds the asset now. */
  buyer: string | null;
  /** Floor price, i.e. the least it can have gone for. */
  floorPrice: bigint;
  startPrice: bigint;
  endedAt: number;
}

export async function fetchNftOutcomes(
  program: Program<AttentionFi>,
  creator: PublicKey,
): Promise<NftOutcome[]> {
  const creatorStr = creator.toBase58();
  const all = await program.account.nftAuction.all();
  const mine = all.filter(
    (a) => a.account.complete && a.account.creator.toBase58() === creatorStr,
  );
  if (mine.length === 0) return [];

  const infos = await program.provider.connection.getMultipleAccountsInfo(
    mine.map((a) => a.account.asset),
  );

  const out: NftOutcome[] = [];
  mine.forEach((a, i) => {
    const info = infos[i];
    const decoded = info ? decodeAsset(info.data) : null;
    const key = a.account.asset.toBase58();
    // A burned/missing asset can't be attributed either way; treat it as sold
    // rather than telling the lister it's back when it isn't in their wallet.
    const owner = decoded?.owner ?? null;
    const reclaimed = owner === creatorStr;
    out.push({
      asset: key,
      name: decoded?.name || short(key),
      uri: decoded?.uri || undefined,
      outcome: reclaimed ? "reclaimed" : "sold",
      buyer: reclaimed ? null : owner,
      floorPrice: BigInt(a.account.floorPrice.toString()),
      startPrice: BigInt(a.account.startPrice.toString()),
      endedAt: Number(a.account.startTime.toString()) + Number(a.account.duration.toString()),
    });
  });
  return out.sort((x, y) => y.endedAt - x.endedAt);
}

/** A perk the protocol has authorised for a wallet but which isn't minted yet. */
export interface PerkGrantData {
  recipient: string;
  level: number;
  granter: string;
}

/**
 * The pending perk grant for a wallet, if any.
 *
 * A grant is an entitlement, not the NFT: `claim_perk` is what mints it, paid
 * for by the recipient. Returns null once claimed (the grant account closes) or
 * when none was ever issued.
 */
export async function fetchPerkGrant(
  program: Program<AttentionFi>,
  recipient: PublicKey,
): Promise<PerkGrantData | null> {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("perkgrant"), recipient.toBytes()],
    program.programId,
  );
  const g = await program.account.perkGrant.fetchNullable(pda).catch(() => null);
  if (!g) return null;
  return {
    recipient: g.recipient.toBase58(),
    level: g.level,
    granter: g.granter.toBase58(),
  };
}

/**
 * The `collection_auction` account `list_nft_auction` expects, or null.
 *
 * That account is optional on-chain, and optional accounts are not resolved by
 * Anchor's client — a call that doesn't name it fails before it ever leaves the
 * browser with "Reached maximum depth for account resolution", which is what
 * broke listing a 1-of-1.
 *
 * Naming it is not enough on its own: an `Option<Account<..>>` is deserialised
 * when supplied, so handing over the address of a collection that was never
 * listed fails just as hard. Hence the existence check. The program uses it to
 * refuse selling a piece out from under someone buying the whole set, so it
 * matters only while the collection's own listing is live.
 */
export async function collectionListingFor(
  program: Program<AttentionFi>,
  collection: string | null | undefined,
): Promise<PublicKey | null> {
  if (!collection) return null;
  const pda = collectionAuctionPda(new PublicKey(collection));
  const info = await program.provider.connection.getAccountInfo(pda).catch(() => null);
  return info ? pda : null;
}

/**
 * A collection's members, as `remainingAccounts` for the escrow instructions.
 *
 * `list_collection_auction`, `buy_collection` and `reclaim_collection_auction`
 * each move every member, and the program checks the count against the
 * collection's own `current_size` — so a partial list is refused rather than
 * silently escrowing some of the deck. Passing them from one query keeps the
 * three call sites in step; building the list by hand at each was how the
 * counts drifted in the first place.
 *
 * Writable and non-signing: mpl-core mutates each asset's owner, and the
 * authority to do so is the seller's signature or the escrow PDA's seeds, never
 * the asset itself.
 */
export async function collectionMemberAccounts(
  program: Program<AttentionFi>,
  collection: PublicKey,
): Promise<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]> {
  const members = await fetchCollectionAssets(program, collection);
  return members.map((m) => ({
    pubkey: new PublicKey(m.asset),
    isSigner: false,
    isWritable: true,
  }));
}
