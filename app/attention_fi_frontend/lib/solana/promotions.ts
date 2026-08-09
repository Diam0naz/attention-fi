import { PublicKey } from "@solana/web3.js";
import { BN, type Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import {
  collectionAuctionPda,
  feeConfigPda,
  globalPda,
  nftAuctionPda,
  promotionPda,
} from "./program";

/**
 * Paid placement on a listing.
 *
 * `promote_listing` has existed and been callable since the NFT market shipped,
 * and nothing read what it wrote — so an operator could set a daily price in
 * the admin console for a product that could be bought and would then do
 * nothing. The read side was always meant to live here rather than on-chain:
 * ranking is a presentation decision, and putting it in the program would mean
 * a redeploy every time the ordering changed.
 */
export interface Promotion {
  /** The asset or collection whose listing this promotes. */
  subject: string;
  /** Unix seconds through which the listing ranks as promoted. */
  promotedUntil: number;
  /** Lifetime lamports spent, which breaks ties between live promotions. */
  totalPaid: bigint;
}

/** Every promotion on-chain, keyed by subject. One read for the whole market. */
export async function fetchPromotions(
  program: Program<AttentionFi>,
): Promise<Map<string, Promotion>> {
  const all = await program.account.promotion.all().catch(() => []);
  const out = new Map<string, Promotion>();
  for (const p of all) {
    const subject = p.account.subject.toBase58();
    out.set(subject, {
      subject,
      promotedUntil: Number(p.account.promotedUntil.toString()),
      totalPaid: BigInt(p.account.totalPaid.toString()),
    });
  }
  return out;
}

/** Whether a promotion is still running at `nowSec`. */
export function isPromoted(p: Promotion | undefined, nowSec: number): boolean {
  return p !== undefined && p.promotedUntil > nowSec;
}

/**
 * Order listings with live promotions first.
 *
 * Stable within each group: promoted listings keep their existing relative
 * order except where one has paid more, and unpromoted listings are not
 * reordered at all. Paying buys a position above the unpaid, not a reshuffle
 * of everything below.
 *
 * Expired promotions rank as unpromoted rather than being deleted — the record
 * stays for `total_paid`, which is what makes a tie-break meaningful across
 * repeat buyers.
 */
export function byPromotion<T>(
  items: readonly T[],
  subjectOf: (item: T) => string,
  promotions: Map<string, Promotion>,
  nowSec: number,
): T[] {
  return [...items].sort((a, b) => {
    const pa = promotions.get(subjectOf(a));
    const pb = promotions.get(subjectOf(b));
    const la = isPromoted(pa, nowSec);
    const lb = isPromoted(pb, nowSec);
    if (la !== lb) return la ? -1 : 1;
    if (!la) return 0;
    // Both live: more spent ranks higher.
    const spentA = pa?.totalPaid ?? 0n;
    const spentB = pb?.totalPaid ?? 0n;
    return spentB > spentA ? 1 : spentB < spentA ? -1 : 0;
  });
}

/**
 * Buy `days` of placement on a listing.
 *
 * `maxLamports` is the caller's ceiling on the whole purchase. The price is a
 * config value the authority can change, so a transaction signed against one
 * price could otherwise settle at another — the guard is what makes the quote
 * shown on screen binding.
 *
 * Exactly one of the two auction accounts is supplied; the program settles
 * which kind of subject it is from whichever one is passed, and its `has_one`
 * binds it to the subject key.
 */
export async function promoteListing(
  program: Program<AttentionFi>,
  payer: PublicKey,
  subject: PublicKey,
  kind: "asset" | "collection",
  days: number,
  maxLamports: bigint,
): Promise<string> {
  const global = await program.account.global.fetch(globalPda());
  return program.methods
    .promoteListing(days, new BN(maxLamports.toString()))
    .accountsPartial({
      payer,
      global: globalPda(),
      feeConfig: feeConfigPda(),
      treasury: global.treasury,
      subject,
      nftAuction: kind === "asset" ? nftAuctionPda(subject) : null,
      collectionAuction: kind === "collection" ? collectionAuctionPda(subject) : null,
      promotion: promotionPda(subject),
    })
    .rpc();
}
