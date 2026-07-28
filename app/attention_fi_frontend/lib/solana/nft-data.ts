import type { Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { NftCardData } from "@/components/nft/nft-card";

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
function decodeAsset(data: Buffer): { name: string; uri: string; collection: string | null } | null {
  try {
    let offset = 1 + 32; // key + owner
    const authorityTag = data.readUInt8(offset);
    offset += 1;
    let collection: string | null = null;
    if (authorityTag !== 0) {
      if (authorityTag === 2) collection = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      offset += 32; // Address(Pubkey) or Collection(Pubkey)
    }

    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.subarray(offset, offset + uriLen).toString("utf8");

    return { name, uri, collection };
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

  return all.map((a) => {
    const key = a.account.asset.toBase58();
    const decoded = decodedByAsset.get(key) ?? null;
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
    };
  });
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
): Promise<{ cards: NftCardData[]; tracked: Set<string> }> {
  const [genesis, perks, verifications] = await Promise.all([
    program.account.genesisNft.all(),
    program.account.perkNft.all(),
    program.account.verification.all(),
  ]);

  const cards: NftCardData[] = [];
  const tracked = new Set<string>();
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
      cards.push({ kind: "genesis", shareBps: g.account.shareBps, id: short(g.account.asset.toBase58()) });
      tracked.add(g.account.asset.toBase58());
    }
  }
  return { cards, tracked };
}

/**
 * The AttentionFi NFTs owned by a wallet, read from the program's PDAs
 * (verification by subject, perk + genesis by owner) plus any standalone
 * collectible Core assets. Maps to NftCardData for the collection grid.
 * Returns [] when the wallet holds none.
 */
export async function fetchOwnedNfts(program: Program<AttentionFi>, owner: PublicKey): Promise<NftCardData[]> {
  const { cards, tracked } = await fetchProgramNfts(program, owner.toBase58());
  const standalone = await fetchStandaloneAssets(program, owner, tracked).catch(() => []);
  return [
    ...cards,
    ...standalone.map((a) => ({ kind: "custom" as const, name: a.name, image: a.uri, id: short(a.asset) })),
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
