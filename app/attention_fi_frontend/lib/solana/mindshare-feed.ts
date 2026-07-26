"use client";

// Frontend half of the decentralized-launch path. When NEXT_PUBLIC_MINDSHARE_FEED
// points at a Switchboard On-Demand pull feed (created with scripts/create-feed.ts),
// a bonding-curve launch seeds its price from live mindshare via the on-chain
// oracle (launch_from_feed) instead of a keeper-supplied tier.
//
// Pull feeds are stale until refreshed, so the launch transaction must carry the
// oracle update first: tx = [...feed update ixs, launch_from_feed ix]. The heavy
// Switchboard SDK is dynamically imported so it only loads on this opt-in path
// and never bloats the default bundle.

import type { Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import type { AnchorProvider, Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { AnchorWalletLike } from "./program";

/** The configured mindshare feed, or null when the live-mindshare path is off. */
export function mindshareFeedPubkey(): PublicKey | null {
  const raw = process.env.NEXT_PUBLIC_MINDSHARE_FEED;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export function mindshareFeedEnabled(): boolean {
  return mindshareFeedPubkey() !== null;
}

/**
 * Launch a bonding-curve token whose starting tier is read on-chain from the
 * Switchboard mindshare feed. Composes the oracle refresh and the launch into a
 * single transaction, signs it with the new mint + the connected wallet, and
 * returns the signature. Throws if the feed isn't configured or has no fresh
 * oracle response yet.
 */
export async function launchFromFeed(
  program: Program<AttentionFi>,
  mint: Keypair,
): Promise<string> {
  const feed = mindshareFeedPubkey();
  if (!feed) throw new Error("Live-mindshare launch is not configured (NEXT_PUBLIC_MINDSHARE_FEED).");

  const provider = program.provider as AnchorProvider;
  const { connection } = provider;
  const wallet = provider.wallet as AnchorWalletLike;
  const creator = wallet.publicKey;

  // The launch instruction reads the feed; it must come *after* the refresh.
  const launchIx = await program.methods
    .launchFromFeed()
    .accounts({ creator, mint: mint.publicKey, feed })
    .instruction();

  // Fresh signed oracle update (Ed25519 verify + feed write). numSuccess < 1
  // means the oracles didn't respond — fail loudly rather than launch stale.
  const sb = await import("@switchboard-xyz/on-demand");
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection);
  const pullFeed = new sb.PullFeed(sbProgram, feed);
  const [updateIxs, , numSuccess, luts] = await pullFeed.fetchUpdateIx({ payer: creator });
  if (!updateIxs || updateIxs.length === 0 || numSuccess < 1) {
    throw new Error("Mindshare feed has no fresh oracle response yet — try again shortly.");
  }

  const tx = await sb.asV0Tx({
    connection,
    ixs: [...updateIxs, launchIx],
    payer: creator,
    signers: [mint],
    lookupTables: luts,
  });

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendTransaction(signed, { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
