import type { Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { NftCardData } from "@/components/nft/nft-card";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** A 1-of-1 Dutch auction, read straight from its on-chain `NftAuction` PDA. */
export interface NftAuctionData {
  asset: string;
  creator: string;
  startPrice: bigint;
  floorPrice: bigint;
  startTime: number;
  duration: number;
  complete: boolean;
}

/** Every listed 1-of-1 auction (open, closed, expired) — filter client-side. */
export async function fetchNftAuctions(program: Program<AttentionFi>): Promise<NftAuctionData[]> {
  const all = await program.account.nftAuction.all();
  return all.map((a) => ({
    asset: a.account.asset.toBase58(),
    creator: a.account.creator.toBase58(),
    startPrice: BigInt(a.account.startPrice.toString()),
    floorPrice: BigInt(a.account.floorPrice.toString()),
    startTime: Number(a.account.startTime.toString()),
    duration: Number(a.account.duration.toString()),
    complete: a.account.complete,
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
 * The AttentionFi NFTs owned by a wallet, read from the program's PDAs
 * (verification by subject, perk + genesis by owner). Maps to NftCardData for
 * the collection grid. Returns [] when the wallet holds none.
 */
export async function fetchOwnedNfts(program: Program<AttentionFi>, owner: PublicKey): Promise<NftCardData[]> {
  const ownerStr = owner.toBase58();
  const [genesis, perks, verifications] = await Promise.all([
    program.account.genesisNft.all(),
    program.account.perkNft.all(),
    program.account.verification.all(),
  ]);

  const out: NftCardData[] = [];
  for (const v of verifications) {
    if (v.account.subject.toBase58() === ownerStr) {
      out.push({ kind: "verification", handle: v.account.handle });
    }
  }
  for (const p of perks) {
    if (p.account.owner.toBase58() === ownerStr) {
      out.push({ kind: "perk", level: p.account.level, discountBps: p.account.discountBps });
    }
  }
  for (const g of genesis) {
    if (g.account.owner.toBase58() === ownerStr) {
      out.push({ kind: "genesis", shareBps: g.account.shareBps, id: short(g.account.asset.toBase58()) });
    }
  }
  return out;
}
