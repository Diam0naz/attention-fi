/**
 * Provision the Switchboard On-Demand pull feed the mindshare oracle reads.
 *
 * This script is the missing half of the oracle. The on-chain side —
 * `launch_from_feed`, `update_mindshare`, `oracle_feed::read_mindshare_bps` —
 * has been complete for weeks, and there was no way to create a feed for it to
 * read, so none of it could run.
 *
 * The job fetches `mindshare24h`, never `mindshare`. Spot mindshare is
 * timeable: it seeds a launch's starting price, and a launcher who intends to
 * sell into their own token benefits from publishing at a spike. The averaged
 * field is computed in `lib/mindshare-twap.ts` over the trailing 24 hours —
 * see that file for why the smoothing cannot live on-chain.
 *
 * Usage:
 *   API_ORIGIN=https://your-deployment.example \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/create-feed.ts <handle> [existing-feed-address]
 *
 * With no second argument it creates a feed and prints the address, which goes
 * in NEXT_PUBLIC_MINDSHARE_FEED — and needs a *rebuild*, since NEXT_PUBLIC_
 * variables are inlined at build time rather than read at runtime.
 *
 * With an existing feed address it repoints that feed's job instead. Prefer
 * this when a feed already exists: the address doesn't change, so there is no
 * env edit and no rebuild — which matters because the wrong job is publishing
 * a timeable number until the swap lands, and a rebuild is minutes of that.
 */
import * as anchor from "@anchor-lang/core";

/** How many oracles must agree before a value is usable. */
const MIN_ORACLE_SAMPLES = 1;

/**
 * How long a submitted value stays usable, in slots (~100s at 400ms).
 *
 * Mirrors `FEED_MAX_STALENESS` in constants.rs. The two are independent
 * numbers that must agree: the program refuses a sample older than its own
 * bound, so a feed configured looser would simply produce values the program
 * rejects, which reads as "the oracle is broken" rather than "these are
 * misconfigured".
 */
const MAX_STALENESS_SLOTS = 250;

async function main() {
  const handle = (process.argv[2] ?? "").replace(/^@/, "").trim();
  if (!handle) {
    console.error("usage: ts-node scripts/create-feed.ts <handle>");
    process.exit(1);
  }
  const origin = process.env.API_ORIGIN;
  if (!origin) {
    console.error("error: set API_ORIGIN to the deployment serving /api/mindshare");
    process.exit(1);
  }

  const url = `${origin.replace(/\/$/, "")}/api/mindshare?handle=${encodeURIComponent(handle)}`;

  // Fail before spending anything if the endpoint isn't serving what the job
  // will ask for. A feed that parses a missing path produces no value at all,
  // and the failure surfaces much later as an unlaunchable token.
  const probe = await fetch(url).then((r) => r.json() as Promise<Record<string, unknown>>);
  if (typeof probe.mindshare24h !== "number") {
    console.error(
      `error: ${url} did not return a numeric mindshare24h (got ${JSON.stringify(probe.mindshare24h)}).\n` +
        "The oracle must read the averaged field, not spot.",
    );
    process.exit(1);
  }
  const coverage = typeof probe.coverage24h === "number" ? probe.coverage24h : 0;
  console.log(`@${handle}: mindshare24h = ${probe.mindshare24h}%`);
  if (coverage < 0.5) {
    console.warn(
      `warning: only ${(coverage * 100).toFixed(0)}% of the 24h window has history. ` +
        "The published value is barely smoothed — let the app collect snapshots before relying on it.",
    );
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const sb = await import("@switchboard-xyz/on-demand");
  // OracleJob lives in @switchboard-xyz/common, not the on-demand package.
  const { OracleJob } = await import("@switchboard-xyz/common");
  const program = await sb.AnchorUtils.loadProgramFromConnection(provider.connection);
  const queue = await sb.Queue.loadDefault(program);

  const jobs = [
    OracleJob.fromObject({
      tasks: [
        { httpTask: { url } },
        // The averaged field. Reading `$.mindshare` here would defeat the whole
        // point of publishing an average.
        { jsonParseTask: { path: "$.mindshare24h" } },
      ],
    }),
  ];

  const existing = process.argv[3];
  if (existing) {
    const pullFeed = new sb.PullFeed(program, new anchor.web3.PublicKey(existing));
    const ix = await pullFeed.setConfigsIx({ jobs, maxVariance: 5, minResponses: MIN_ORACLE_SAMPLES });
    const tx = await sb.asV0Tx({
      connection: provider.connection,
      ixs: [ix],
      payer: provider.wallet.publicKey,
      signers: [],
    });
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await provider.connection.sendTransaction(signed);
    await provider.connection.confirmTransaction(sig, "confirmed");
    console.log(`\nfeed ${existing} repointed at $.mindshare24h`);
    console.log(`signature: ${sig}`);
    console.log("\nNo env change and no rebuild — the address is unchanged.");
    return;
  }

  const [pullFeed, keypair] = sb.PullFeed.generate(program);
  const ix = await pullFeed.initIx({
    name: `attentionfi/mindshare/${handle}`,
    queue: queue.pubkey,
    jobs,
    maxVariance: 5,
    minResponses: MIN_ORACLE_SAMPLES,
    minSampleSize: MIN_ORACLE_SAMPLES,
    maxStaleness: MAX_STALENESS_SLOTS,
  });

  const tx = await sb.asV0Tx({
    connection: provider.connection,
    ixs: [ix],
    payer: provider.wallet.publicKey,
    signers: [keypair],
  });
  const signed = await provider.wallet.signTransaction(tx);
  const sig = await provider.connection.sendTransaction(signed);
  await provider.connection.confirmTransaction(sig, "confirmed");

  console.log(`\nfeed created: ${pullFeed.pubkey.toBase58()}`);
  console.log(`signature:    ${sig}`);
  console.log(`\nNEXT_PUBLIC_MINDSHARE_FEED=${pullFeed.pubkey.toBase58()}`);
  console.log("Rebuild after setting it — NEXT_PUBLIC_ vars are inlined at build time.");
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
