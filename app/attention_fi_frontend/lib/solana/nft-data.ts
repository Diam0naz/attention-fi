import type { Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { NftCardData } from "@/components/nft/nft-card";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
/** mpl-core's `Key` enum discriminant for a plain (non-collection) asset account. */
const KEY_ASSET_V1 = 1;

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

/** A 1-of-1 Dutch auction, read straight from its on-chain `NftAuction` PDA. */
export interface NftAuctionData {
  asset: string;
  creator: string;
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
  const collectionByAsset = new Map<string, string | null>();
  all.forEach((a, i) => {
    const info = assetInfos[i];
    const decoded = info ? decodeAsset(info.data) : null;
    collectionByAsset.set(a.account.asset.toBase58(), decoded?.collection ?? null);
  });

  return all.map((a) => ({
    asset: a.account.asset.toBase58(),
    creator: a.account.creator.toBase58(),
    startPrice: BigInt(a.account.startPrice.toString()),
    floorPrice: BigInt(a.account.floorPrice.toString()),
    startTime: Number(a.account.startTime.toString()),
    duration: Number(a.account.duration.toString()),
    complete: a.account.complete,
    collection: collectionByAsset.get(a.account.asset.toBase58()) ?? null,
  }));
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
 * Standalone `mint_nft` collectibles owned by a wallet — plain Core assets
 * with no AttentionFi PDA of their own, so they're invisible to the
 * program-account queries above. Reads mpl-core's account layout directly
 * (memcmp on key + owner) rather than pulling in the full mpl-core JS SDK.
 * `exclude` filters out assets already surfaced via genesis/perk/verification
 * (those are Core assets too, just ones we already have a richer card for).
 */
async function fetchStandaloneNfts(
  program: Program<AttentionFi>,
  owner: PublicKey,
  exclude: Set<string>,
): Promise<NftCardData[]> {
  const accounts = await program.provider.connection.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([KEY_ASSET_V1])) } },
      { memcmp: { offset: 1, bytes: owner.toBase58() } },
    ],
  });

  const out: NftCardData[] = [];
  for (const { pubkey, account } of accounts) {
    const key = pubkey.toBase58();
    if (exclude.has(key)) continue;
    const decoded = decodeAsset(account.data);
    if (!decoded) continue;
    out.push({ kind: "custom", name: decoded.name, image: decoded.uri || undefined, id: short(key) });
  }
  return out;
}

/**
 * The AttentionFi NFTs owned by a wallet, read from the program's PDAs
 * (verification by subject, perk + genesis by owner) plus any standalone
 * collectible Core assets. Maps to NftCardData for the collection grid.
 * Returns [] when the wallet holds none.
 */
export async function fetchOwnedNfts(program: Program<AttentionFi>, owner: PublicKey): Promise<NftCardData[]> {
  const ownerStr = owner.toBase58();
  const [genesis, perks, verifications] = await Promise.all([
    program.account.genesisNft.all(),
    program.account.perkNft.all(),
    program.account.verification.all(),
  ]);

  const out: NftCardData[] = [];
  const trackedAssets = new Set<string>();
  for (const v of verifications) {
    if (v.account.subject.toBase58() === ownerStr) {
      out.push({ kind: "verification", handle: v.account.handle });
      trackedAssets.add(v.account.asset.toBase58());
    }
  }
  for (const p of perks) {
    if (p.account.owner.toBase58() === ownerStr) {
      out.push({ kind: "perk", level: p.account.level, discountBps: p.account.discountBps });
      trackedAssets.add(p.account.asset.toBase58());
    }
  }
  for (const g of genesis) {
    if (g.account.owner.toBase58() === ownerStr) {
      out.push({ kind: "genesis", shareBps: g.account.shareBps, id: short(g.account.asset.toBase58()) });
      trackedAssets.add(g.account.asset.toBase58());
    }
  }

  const standalone = await fetchStandaloneNfts(program, owner, trackedAssets).catch(() => []);
  out.push(...standalone);
  return out;
}
