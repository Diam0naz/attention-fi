import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";

/**
 * Every mint that exists on-chain under any launch mechanism.
 *
 * A token is "live" if the program knows about it, and the program knows about
 * it through one of four different account types — a bonding curve, a
 * conviction curve, a Dutch auction or a revenue offering. Checking only
 * `BondingCurve` marks three quarters of the mechanisms as never having
 * launched, which is what left a real revenue token reading PENDING on its
 * creator's own profile indefinitely.
 *
 * Four `.all()` calls, so this belongs behind a poll rather than in a render
 * path — see the note on the `.all()` ceiling in the indexer work.
 */
export async function fetchLaunchedMints(program: Program<AttentionFi>): Promise<Set<string>> {
  const mints = new Set<string>();
  const sources = [
    program.account.bondingCurve,
    program.account.convictionCurve,
    program.account.dutchAuction,
    program.account.revenueShare,
  ];
  const results = await Promise.all(
    // Settled individually: one mechanism's read failing shouldn't erase the
    // others and mark healthy tokens as pending.
    sources.map((account) =>
      account
        .all()
        .then((rows) => rows.map((r) => (r.account as { mint: { toBase58(): string } }).mint.toBase58()))
        .catch(() => [] as string[]),
    ),
  );
  for (const list of results) for (const mint of list) mints.add(mint);
  return mints;
}
