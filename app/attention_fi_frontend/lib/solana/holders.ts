import { Connection, PublicKey } from "@solana/web3.js";
import { poolPda } from "./amm";
import { ata, curvePda } from "./program";

export interface HolderRow {
  rank: number;
  /** Base58 owner, or a label for the venue accounts and the tail. */
  wallet: string;
  /** Share of circulating supply, 0..100. */
  pct: number;
  /** Whole tokens held. */
  amount: number;
  tag?: "curve" | "pool" | "creator" | "others" | "you";
}

export interface HoldersResult {
  holders: HolderRow[];
  /** Distinct accounts with a non-zero balance, as far as the RPC reports. */
  count: number;
  /**
   * True when the tail is an aggregate rather than an enumeration.
   *
   * `getTokenLargestAccounts` returns at most 20 accounts, so beyond that we
   * know the *remaining supply* but not how many wallets hold it. Saying so is
   * the difference between a distribution and a guess.
   */
  truncated: boolean;
}

const EMPTY: HoldersResult = { holders: [], count: 0, truncated: false };

/**
 * Who holds a token, from the chain.
 *
 * Replaces a mock that derived a plausible-looking distribution from a hash of
 * the handle — including an invented "+2,431 others" tail. A fabricated
 * concentration figure is worse than none: holder distribution is exactly what
 * someone checks before buying, and the mock's shape (curve ~38%, creator ~8%,
 * a smooth decay) always looked healthy.
 *
 * `getTokenLargestAccounts` is one call and returns the top 20 by balance,
 * which is the whole question for concentration. It reports token *accounts*,
 * so the owner is resolved in a second batched call — an owner with several
 * accounts for the same mint would otherwise appear as several holders, each
 * looking smaller than they are.
 */
export async function fetchHolders(
  connection: Connection,
  mint: PublicKey,
  opts: { creator?: string | null; viewer?: string | null } = {},
): Promise<HoldersResult> {
  let largest;
  let supplyRes;
  try {
    [largest, supplyRes] = await Promise.all([
      connection.getTokenLargestAccounts(mint),
      connection.getTokenSupply(mint),
    ]);
  } catch {
    return EMPTY;
  }

  const decimals = supplyRes.value.decimals;
  const totalSupply = Number(supplyRes.value.amount) / 10 ** decimals;
  if (totalSupply <= 0) return EMPTY;

  const accounts = largest.value.filter((a) => Number(a.amount) > 0);
  if (accounts.length === 0) return EMPTY;

  // Resolve token accounts to their owners in one batch, then merge — a single
  // wallet holding through two accounts is one holder, not two.
  let owners: (string | null)[] = [];
  try {
    const infos = await connection.getMultipleAccountsInfo(accounts.map((a) => a.address));
    owners = infos.map((info) =>
      // SPL token account layout: mint(32) then owner(32).
      info && info.data.length >= 64 ? new PublicKey(info.data.subarray(32, 64)).toBase58() : null,
    );
  } catch {
    owners = accounts.map(() => null);
  }

  const curve = curvePda(mint).toBase58();
  const pool = poolPda(mint).toBase58();
  // The venues hold their inventory in ATAs owned by their PDAs, so the owner
  // resolved above is the PDA itself.
  const curveVault = ata(curvePda(mint), mint).toBase58();
  const poolVault = ata(poolPda(mint), mint).toBase58();

  const byOwner = new Map<string, { amount: number; tag?: HolderRow["tag"] }>();
  for (const [i, acc] of accounts.entries()) {
    const address = acc.address.toBase58();
    const owner = owners[i] ?? address;
    const amount = Number(acc.amount) / 10 ** decimals;

    let key = owner;
    let tag: HolderRow["tag"] | undefined;
    if (owner === curve || address === curveVault) {
      key = "Bonding curve";
      tag = "curve";
    } else if (owner === pool || address === poolVault) {
      key = "AMM pool";
      tag = "pool";
    } else if (opts.viewer && owner === opts.viewer) {
      tag = "you";
    } else if (opts.creator && owner === opts.creator) {
      tag = "creator";
    }

    const prev = byOwner.get(key);
    byOwner.set(key, { amount: (prev?.amount ?? 0) + amount, tag: tag ?? prev?.tag });
  }

  const ranked = [...byOwner.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const holders: HolderRow[] = ranked.map(([wallet, v], i) => ({
    rank: i + 1,
    wallet,
    amount: v.amount,
    pct: (v.amount / totalSupply) * 100,
    ...(v.tag ? { tag: v.tag } : {}),
  }));

  // Whatever the top accounts don't cover. Reported as one aggregate row with
  // no holder count, because the RPC didn't tell us one and inventing a number
  // here is precisely what the mock did.
  const covered = holders.reduce((sum, h) => sum + h.amount, 0);
  const rest = totalSupply - covered;
  const truncated = largest.value.length >= 20 && rest / totalSupply > 0.0001;
  if (truncated) {
    holders.push({
      rank: holders.length + 1,
      wallet: "Everyone else",
      amount: rest,
      pct: (rest / totalSupply) * 100,
      tag: "others",
    });
  }

  return { holders, count: byOwner.size, truncated };
}
