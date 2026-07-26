/**
 * Provision a Switchboard On-Demand pull feed that reads a handle's mindshare
 * from AttentionFi's own /api/mindshare endpoint. Run once per handle you want
 * to launch from the decentralized oracle (launch_from_feed / update_mindshare).
 *
 * The feed runs one OracleJob: an HttpTask hits
 *   {MINDSHARE_API_BASE}/api/mindshare?handle=<handle>
 * and a JsonParseTask pulls `$.mindshare` — the same top-level number the UI
 * reads. Whatever produces that number (the organic X aggregator today, Kaito
 * later) is invisible to the oracle; only the endpoint's shape matters.
 *
 * Usage:
 *   MINDSHARE_API_BASE=https://your-app.vercel.app \
 *   FEED_RPC_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx tsx scripts/create-feed.ts <handle>
 *
 * Prints the feed pubkey — set it as NEXT_PUBLIC_MINDSHARE_FEED (per handle you
 * plan to launch, or a single default feed) so the launch flow can seed price
 * from live mindshare instead of a keeper-supplied tier.
 *
 * MINDSHARE_API_BASE must be publicly reachable by Switchboard's oracle gateway
 * — localhost won't resolve. Deploy the app (or expose it via a tunnel) first.
 */
import { homedir } from "node:os";
import { Connection } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { AnchorUtils, PullFeed, Queue, asV0Tx } from "@switchboard-xyz/on-demand";

// Keep these aligned with the program's constants (FEED_MAX_STALENESS /
// FEED_MIN_SAMPLES in constants.rs) so read_mindshare_bps accepts the feed.
const MAX_STALENESS = 250;
const MIN_SAMPLE_SIZE = 1;
const MIN_RESPONSES = 1;
const MAX_VARIANCE = 1.0;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`error: ${name} is required`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const handle = process.argv[2]?.replace(/^@/, "").toLowerCase();
  if (!handle) {
    console.error("usage: npx tsx scripts/create-feed.ts <handle>");
    process.exit(1);
  }

  const apiBase = requireEnv("MINDSHARE_API_BASE").replace(/\/$/, "");
  const rpc =
    process.env.FEED_RPC_URL ??
    process.env.NEXT_PUBLIC_RPC_ENDPOINT ??
    "https://api.devnet.solana.com";
  const walletPath = (process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`).replace(
    /^~/,
    homedir(),
  );

  const connection = new Connection(rpc, "confirmed");
  const [wallet, walletKp] = AnchorUtils.initWalletFromFile(walletPath);
  const program = await AnchorUtils.loadProgramFromConnection(connection, wallet);
  const queue = await Queue.loadDefault(program);

  const jobs = [
    OracleJob.fromObject({
      tasks: [
        { httpTask: { url: `${apiBase}/api/mindshare?handle=${encodeURIComponent(handle)}` } },
        { jsonParseTask: { path: "$.mindshare" } },
      ],
    }),
  ];

  const [pullFeed, feedKp] = PullFeed.generate(program);
  const ix = await pullFeed.initIx({
    name: `mindshare:${handle}`.slice(0, 32),
    queue: queue.pubkey,
    maxVariance: MAX_VARIANCE,
    minResponses: MIN_RESPONSES,
    minSampleSize: MIN_SAMPLE_SIZE,
    maxStaleness: MAX_STALENESS,
    jobs,
  });

  const tx = await asV0Tx({
    connection,
    ixs: [ix],
    payer: wallet.publicKey,
    signers: [walletKp, feedKp],
  });

  console.log(`Creating mindshare feed for @${handle} on ${rpc} ...`);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");

  console.log("\n✅ Feed created");
  console.log(`   handle:  @${handle}`);
  console.log(`   feed:    ${pullFeed.pubkey.toBase58()}`);
  console.log(`   tx:      ${sig}`);
  console.log(`\nSet this in your environment to enable the live-mindshare launch path:`);
  console.log(`   NEXT_PUBLIC_MINDSHARE_FEED=${pullFeed.pubkey.toBase58()}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
