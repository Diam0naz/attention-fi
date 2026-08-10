import { PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { genesisPoolPda } from "./program";

const BPS = 10_000;

/**
 * What a creator is actually giving away when they issue fee-share NFTs.
 *
 * Two things made this worth computing properly rather than inline. The first
 * is that a genesis NFT's share is a slice of the *creator's* cut, not of
 * trading volume — so "1% per unit" is 1% of the half-of-one-percent the
 * creator earns, and the two readings differ by two orders of magnitude. The
 * second is that the forms only ever multiplied units by share, ignoring what
 * the token had already committed: a creator who has sold 60% of their stream
 * saw "5 × 1% = 5%" and had no way to learn the real answer was 65%.
 *
 * Everything here is derived from the same numbers the program uses, so the
 * preview and the transaction cannot disagree.
 */
export interface DilutionEstimate {
  /** Basis points of the creator's fee stream already sold. */
  committedBps: number;
  /** Basis points this issuance would add. */
  addedBps: number;
  /** Committed + added. Over 10,000 is oversubscribed. */
  totalBps: number;
  /** Share of their own stream the creator keeps afterwards, 0..1. */
  keptFraction: number;
  /** The creator's cut of trading volume today, as a fraction (0.005 = 0.5%). */
  creatorCutOfVolume: number;
  /** That cut after this issuance. */
  creatorCutAfter: number;
  /** True when the total exceeds the whole stream. */
  oversubscribed: boolean;
  /**
   * What each holder would really receive once the stream is oversubscribed.
   *
   * `split_genesis_fee` clamps the payout at the creator's whole cut, so an
   * over-100% programme doesn't overpay — it silently pays everyone less than
   * the number printed on their NFT. Worth showing, because the program accepts
   * this happily and the holders are the ones who discover it.
   */
  effectiveShareBpsPerUnit: number;
}

/** How much of a token's fee stream has already been sold, in bps. */
export async function fetchCommittedShareBps(
  program: Program<AttentionFi>,
  subjectMint: PublicKey,
): Promise<number> {
  const pool = await program.account.genesisPool
    .fetchNullable(genesisPoolPda(subjectMint))
    .catch(() => null);
  return pool ? Number(pool.totalShareBps.toString()) : 0;
}

/**
 * Model an issuance of `units` NFTs at `shareBpsPerUnit` each.
 *
 * `feeBps` and `creatorFeeShareBps` come from `Global` rather than being
 * assumed, because both are tunable without a redeploy — a preview hardcoding
 * 1% and 50% would quietly start lying the first time either is retuned.
 */
export function estimateDilution({
  units,
  shareBpsPerUnit,
  committedBps,
  feeBps,
  creatorFeeShareBps,
}: {
  units: number;
  shareBpsPerUnit: number;
  committedBps: number;
  feeBps: number;
  creatorFeeShareBps: number;
}): DilutionEstimate {
  const addedBps = Math.max(0, Math.round(units * shareBpsPerUnit));
  const totalBps = committedBps + addedBps;
  const oversubscribed = totalBps > BPS;

  const creatorCutOfVolume = (feeBps / BPS) * (creatorFeeShareBps / BPS);
  const keptFraction = Math.max(0, (BPS - Math.min(totalBps, BPS)) / BPS);

  return {
    committedBps,
    addedBps,
    totalBps,
    keptFraction,
    creatorCutOfVolume,
    creatorCutAfter: creatorCutOfVolume * keptFraction,
    oversubscribed,
    // Pro-rata against the oversubscribed total, which is what the clamp
    // produces in practice.
    effectiveShareBpsPerUnit: oversubscribed
      ? Math.round((shareBpsPerUnit / totalBps) * BPS)
      : shareBpsPerUnit,
  };
}

/**
 * The creator's earnings on a reference volume, before and after.
 *
 * A percentage of a percentage is genuinely hard to hold in your head at the
 * moment of signing; the same fact in currency is not. The reference figure is
 * arbitrary and labelled as such — it exists to make the ratio legible, not to
 * forecast anything.
 */
export function earningsOn(volumeUsd: number, e: DilutionEstimate): {
  before: number;
  after: number;
  givenAway: number;
} {
  const before = volumeUsd * e.creatorCutOfVolume;
  const after = volumeUsd * e.creatorCutAfter;
  return { before, after, givenAway: before - after };
}
