"use client";

// Frontend half of the decentralized-launch path. When a Switchboard On-Demand
// pull feed is configured for a handle (via NEXT_PUBLIC_MINDSHARE_FEEDS or
// NEXT_PUBLIC_MINDSHARE_FEED), a bonding-curve launch for that handle seeds its
// price from the live on-chain oracle (launch_from_feed) instead of a
// keeper-supplied tier argument.
//
// Feed configuration supports two shapes:
//
//   NEXT_PUBLIC_MINDSHARE_FEEDS={"solana_kol":"<feedPubkey>","ansem":"<feedPubkey>"}
//     — per-handle map. Use this for production where you want specific handles
//       to have tamper-proof tier derivation.
//
//   NEXT_PUBLIC_MINDSHARE_FEED=<feedPubkey>
//     — single global fallback feed (used for every launch when no per-handle
//       entry exists). Kept for backward compatibility.
//
// When NO feed is found for a handle, launchFromFeed falls back gracefully to
// the keeper-tier launchToken path — the same path used by all non-bonding
// mechanisms. This means: leaving both env vars blank never breaks launches,
// it just uses the keeper tier instead of the oracle.
//
// Pull feeds are stale until refreshed, so the launch transaction must carry the
// oracle update first: tx = [...feed update ixs, launch_from_feed ix]. The
// heavy Switchboard SDK is dynamically imported so it only loads on this
// opt-in path and never bloats the default bundle.

import type { Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import type { AnchorProvider, Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { AnchorWalletLike } from "./program";
import { metadataPda } from "./program";

// ─── Feed resolution ────────────────────────────────────────────────────────

/**
 * Parse NEXT_PUBLIC_MINDSHARE_FEEDS as a JSON object of handle→feedPubkey.
 * Returns an empty map on any parse/validation error.
 */
function parseFeedsMap(): Map<string, PublicKey> {
  const raw = process.env.NEXT_PUBLIC_MINDSHARE_FEEDS;
  if (!raw) return new Map();
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const map = new Map<string, PublicKey>();
    for (const [handle, pubkeyStr] of Object.entries(obj)) {
      if (typeof pubkeyStr !== "string") continue;
      try {
        map.set(handle.replace(/^@/, "").toLowerCase(), new PublicKey(pubkeyStr));
      } catch {
        // skip malformed entries — one bad key shouldn't kill the whole map
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * The configured global fallback feed, or null.
 * Reads NEXT_PUBLIC_MINDSHARE_FEED (singular, backward-compat).
 */
export function mindshareFeedPubkey(): PublicKey | null {
  const raw = process.env.NEXT_PUBLIC_MINDSHARE_FEED;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

/**
 * Look up the Switchboard feed for a specific handle.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_MINDSHARE_FEEDS (per-handle JSON map)
 *   2. NEXT_PUBLIC_MINDSHARE_FEED  (single global fallback)
 *   3. null — no feed configured; caller should use the keeper-tier path
 */
export function feedForHandle(handle: string): PublicKey | null {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  const perHandle = parseFeedsMap().get(normalized);
  if (perHandle) return perHandle;
  return mindshareFeedPubkey();
}

/**
 * Whether any feed is configured (for any handle, or the global fallback).
 * Used by the UI to decide whether to show the oracle badge.
 */
export function mindshareFeedEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_MINDSHARE_FEED) return true;
  if (process.env.NEXT_PUBLIC_MINDSHARE_FEEDS) {
    return parseFeedsMap().size > 0;
  }
  return false;
}

/**
 * Whether a feed is configured specifically for this handle (or globally).
 * More granular than mindshareFeedEnabled — used in the launch flow to show
 * per-handle oracle status.
 */
export function feedEnabledForHandle(handle: string): boolean {
  return feedForHandle(handle) !== null;
}

// ─── Launch ──────────────────────────────────────────────────────────────────

export type LaunchResult =
  | { path: "oracle"; sig: string }
  | { path: "keeper"; sig: string };

/**
 * Launch a bonding-curve token. Automatically picks the best available path:
 *
 *  - "oracle"  — a Switchboard feed is configured for this handle. Bundles the
 *                feed update + launch_from_feed into one v0 transaction; the
 *                tier is derived on-chain from live mindshare.
 *
 *  - "keeper"  — no feed is configured (or fetchUpdateIx returned 0 successes).
 *                Falls back to launchToken at the flat start (NewEntrant). The
 *                program only lets the protocol authority choose a seeded tier
 *                there, because the caller supplies it; a mindshare-seeded price
 *                has to come from the oracle path.
 *
 * @param program   - Connected Anchor program instance
 * @param mint      - Fresh mint keypair for the new token
 * @param metadata  - Token name/symbol/uri
 * @param tierArg   - Kept for the call signature. The keeper path no longer
 *                    sends it: a creator's launch_token is always the flat start.
 * @param handle    - X handle this token is for (used to look up the feed)
 */
export async function launchFromFeed(
  program: Program<AttentionFi>,
  mint: Keypair,
  metadata: { name: string; symbol: string; uri: string },
  tierArg: object,
  handle: string,
): Promise<LaunchResult> {
  console.log("[launchFromFeed] Started for mint:", mint.publicKey.toBase58(), "handle:", handle);

  const feed = feedForHandle(handle);
  if (!feed) {
    console.log("[launchFromFeed] No feed for handle, using keeper-tier path");
    const sig = await keeperLaunch(program, mint, metadata, tierArg);
    return { path: "keeper", sig };
  }

  const provider = program.provider as AnchorProvider;
  const { connection } = provider;
  const wallet = provider.wallet as AnchorWalletLike;
  const creator = wallet.publicKey;

  console.log("[launchFromFeed] Feed found:", feed.toBase58(), "— building launch_from_feed ix");
  const launchIx = await program.methods
    .launchFromFeed(metadata)
    .accounts({
      creator,
      mint: mint.publicKey,
      feed,
      metadata: metadataPda(mint.publicKey),
    })
    .instruction();

  console.log("[launchFromFeed] Loading Switchboard SDK...");
  const sb = await import("@switchboard-xyz/on-demand");
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection);
  const pullFeed = new sb.PullFeed(sbProgram, feed);

  console.log("[launchFromFeed] Fetching oracle update ix...");
  let updateIxs: Awaited<ReturnType<typeof pullFeed.fetchUpdateIx>>[0];
  let luts: Awaited<ReturnType<typeof pullFeed.fetchUpdateIx>>[3];
  let numSuccess: number;

  try {
    [updateIxs, , numSuccess, luts] = await pullFeed.fetchUpdateIx({ payer: creator });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[launchFromFeed] fetchUpdateIx threw:", msg, "— falling back to keeper-tier path");
    const sig = await keeperLaunch(program, mint, metadata, tierArg);
    return { path: "keeper", sig };
  }

  if (!updateIxs || updateIxs.length === 0 || numSuccess < 1) {
    console.warn(
      "[launchFromFeed] No oracle response (numSuccess:", numSuccess, ") — falling back to keeper-tier path",
    );
    const sig = await keeperLaunch(program, mint, metadata, tierArg);
    return { path: "keeper", sig };
  }

  console.log("[launchFromFeed] Oracle responded (numSuccess:", numSuccess, ") — building v0 tx");
  const tx = await sb.asV0Tx({
    connection,
    ixs: [...updateIxs, launchIx],
    payer: creator,
    signers: [mint],
    lookupTables: luts,
  });

  console.log("[launchFromFeed] Requesting wallet signature...");
  const signed = await wallet.signTransaction(tx);
  console.log("[launchFromFeed] Signed. Sending...");
  const sig = await connection.sendRawTransaction(signed.serialize());
  console.log("[launchFromFeed] Sent. Confirming...");
  await connection.confirmTransaction(sig, "confirmed");
  console.log("[launchFromFeed] Confirmed via oracle path:", sig);
  return { path: "oracle", sig };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** The flat start the program allows any creator on the keeper path. */
const FLAT_START = { newEntrant: {} } as const;

/**
 * The keeper launch path — a plain legacy transaction, no Switchboard.
 *
 * Always the flat start. launch_token takes its tier from the caller, so the
 * program refuses a seeded tier from anyone but the protocol authority
 * (TierRequiresOracle); sending the client's own estimate would only fail.
 */
async function keeperLaunch(
  program: Program<AttentionFi>,
  mint: Keypair,
  metadata: { name: string; symbol: string; uri: string },
  _tierArg: object,
): Promise<string> {
  console.log("[keeperLaunch] Sending launchToken at the flat start");
  const provider = program.provider as AnchorProvider;
  const creator = (provider.wallet as AnchorWalletLike).publicKey;
  return program.methods
    .launchToken(FLAT_START as never, metadata)
    .accounts({
      creator,
      mint: mint.publicKey,
      metadata: metadataPda(mint.publicKey),
    })
    .signers([mint])
    .rpc();
}
