"use client";

import { PublicKey } from "@solana/web3.js";
import type { AnchorProvider, Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { AnchorWalletLike } from "./program";
import { mindsharePda } from "./program";
import { feedForHandle } from "./mindshare-feed";

/** Tier names, indexed by the program's `MindshareTier::as_u8`. */
const TIER_NAMES = ["New entrant", "Emerging", "Top 100", "Top 10"] as const;

export interface OnchainMindshare {
  mint: string;
  /** Conversation share in basis points — 324 is 3.24%. */
  bps: number;
  /** Percent, for display. */
  percent: number;
  tier: number;
  tierName: string;
  /** Slot of the last refresh. */
  updatedSlot: number;
  /** Slots since the refresh, against the chain's current slot. */
  ageSlots: number;
  /**
   * Whether the program would still accept this sample.
   *
   * Mirrors `FEED_MAX_STALENESS`. Worth surfacing because a stale snapshot
   * isn't wrong, it's expired — and the difference decides whether a reader is
   * looking at something the protocol would act on or a historical curiosity.
   */
  fresh: boolean;
}

/** Mirrors `FEED_MAX_STALENESS` in constants.rs (~100s at 400ms slots). */
export const MAX_STALENESS_SLOTS = 250;

/**
 * Read a token's on-chain mindshare, or null when it has never been cranked.
 *
 * Null is the ordinary state, not an error: `update_mindshare` is
 * permissionless and nothing calls it automatically, so a token has no snapshot
 * until someone pays for one. Callers should say "not on-chain yet" rather than
 * implying a failure.
 */
export async function fetchOnchainMindshare(
  program: Program<AttentionFi>,
  mint: PublicKey,
): Promise<OnchainMindshare | null> {
  const raw = await program.account.mindshareState
    .fetchNullable(mindsharePda(mint))
    .catch(() => null);
  if (!raw) return null;

  const updatedSlot = Number(raw.updatedSlot.toString());
  const slot = await program.provider.connection.getSlot().catch(() => updatedSlot);
  const bps = Number(raw.mindshareBps.toString());
  const tier = Number(raw.tier);
  const ageSlots = Math.max(0, slot - updatedSlot);

  return {
    mint: raw.mint.toBase58(),
    bps,
    percent: bps / 100,
    tier,
    tierName: TIER_NAMES[tier] ?? `Tier ${tier}`,
    updatedSlot,
    ageSlots,
    fresh: ageSlots <= MAX_STALENESS_SLOTS,
  };
}

/**
 * Refresh a token's on-chain mindshare from the Switchboard feed.
 *
 * Permissionless — anyone may pay to crank any token, and the value comes from
 * the oracle rather than the caller, so there is nothing to gain by being the
 * one who calls it.
 *
 * The oracle refresh and the write must ride in one transaction, in that order:
 * a pull feed holds no value until a signed oracle response is written to it,
 * so `update_mindshare` on its own reads whatever was left from the last
 * crank — or fails outright on a feed nobody has touched.
 *
 * @param handle - The X handle this token represents, used to look up the
 *                 correct per-handle feed (falls back to the global feed).
 */
export async function refreshOnchainMindshare(
  program: Program<AttentionFi>,
  mint: PublicKey,
  handle: string,
): Promise<string> {
  const feed = feedForHandle(handle);
  if (!feed) {
    throw new Error("No mindshare feed is configured for this handle (NEXT_PUBLIC_MINDSHARE_FEEDS / NEXT_PUBLIC_MINDSHARE_FEED).");
  }

  const provider = program.provider as AnchorProvider;
  const { connection } = provider;
  const payer = (provider.wallet as AnchorWalletLike).publicKey;

  const updateIx = await program.methods
    .updateMindshare()
    .accountsPartial({ payer, mint, feed, mindshare: mindsharePda(mint) })
    .instruction();

  // Dynamically imported: the Switchboard SDK is large and only this opt-in
  // path needs it, so it stays out of the default bundle.
  const sb = await import("@switchboard-xyz/on-demand");
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection);
  const pullFeed = new sb.PullFeed(sbProgram, feed);
  const [oracleIxs, , numSuccess, luts] = await pullFeed.fetchUpdateIx({ payer });
  if (!oracleIxs || oracleIxs.length === 0 || numSuccess < 1) {
    throw new Error("No oracle responded for the mindshare feed — try again shortly.");
  }

  const tx = await sb.asV0Tx({
    connection,
    ixs: [...oracleIxs, updateIx],
    payer,
    signers: [],
    lookupTables: luts,
  });
  const signed = await (provider.wallet as AnchorWalletLike).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
