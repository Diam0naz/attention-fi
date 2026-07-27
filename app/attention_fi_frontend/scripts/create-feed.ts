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
 * MINDSHARE_API_BASE must be resolvable by Switchboard's oracle gateway —
 * localhost won't work. It does NOT have to be a public launch: an unlisted
 * Vercel preview URL is enough, and the deployment can stay behind Vercel
 * Deployment Protection if you pass the bypass token as a request header:
 *
 *   MINDSHARE_API_HEADERS='{"x-vercel-protection-bypass":"<token>"}'
 *
 * Headers are baked into the feed's job definition, so anyone who can read the
 * job can read them — use a scoped bypass token, never a real credential.
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

  // Optional request headers, e.g. a Vercel protection-bypass token so the
  // deployment can stay unlisted/protected while the oracle still reaches it.
  let headers: { key: string; value: string }[] = [];
  const rawHeaders = process.env.MINDSHARE_API_HEADERS;
  if (rawHeaders) {
    try {
      headers = Object.entries(JSON.parse(rawHeaders) as Record<string, string>).map(
        ([key, value]) => ({ key, value: String(value) }),
      );
    } catch {
      console.error("error: MINDSHARE_API_HEADERS must be a JSON object of header->value");
      process.exit(1);
    }
  }

  const url = `${apiBase}/api/mindshare?handle=${encodeURIComponent(handle)}`;

  // Fail fast if the oracle won't be able to read this endpoint — far cheaper
  // to catch here than to debug a feed that silently never resolves.
  // Generous: a cold sweep can take a few seconds, and a false negative here
  // would send you debugging a deployment that was actually fine.
  const probe = await fetch(url, {
    headers: Object.fromEntries(headers.map((h) => [h.key, h.value])),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!probe || !probe.ok) {
    console.error(
      `error: ${url} returned ${probe ? probe.status : "no response"}.\n` +
        "The Switchboard oracles fetch this URL themselves, so it must be reachable\n" +
        "from the public internet. If the deployment is protected, pass a bypass\n" +
        "token via MINDSHARE_API_HEADERS.",
    );
    process.exit(1);
  }
  const probed = (await probe.json().catch(() => ({}))) as { mindshare?: unknown };
  if (typeof probed.mindshare !== "number") {
    console.error("error: response has no numeric top-level `mindshare` field to parse");
    process.exit(1);
  }
  console.log(`Endpoint OK — @${handle} currently reads ${probed.mindshare}`);

  const jobs = [
    OracleJob.fromObject({
      tasks: [
        { httpTask: headers.length > 0 ? { url, headers } : { url } },
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

  // Feed init runs right up against the default compute allowance (the
  // Switchboard program alone burns ~90k CU creating the account and storing
  // the job), so give it explicit headroom rather than relying on the estimate.
  // The priority fee keeps it moving on a congested devnet.
  const tx = await asV0Tx({
    connection,
    ixs: [ix],
    payer: wallet.publicKey,
    signers: [walletKp, feedKp],
    computeUnitLimitMultiple: Number(process.env.FEED_CU_MULTIPLE) || 3,
    computeUnitPrice: Number(process.env.FEED_CU_PRICE) || 50_000,
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
  // web3.js truncates program logs in the message; print them in full since
  // they're what actually identifies the failing instruction.
  const logs = (e as { logs?: string[] })?.logs;
  if (Array.isArray(logs)) {
    console.error("\nProgram logs:");
    for (const l of logs) console.error(`  ${l}`);
  }
  process.exit(1);
});
