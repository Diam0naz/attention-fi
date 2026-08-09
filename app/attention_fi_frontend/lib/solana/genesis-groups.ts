import type { Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { decodeAsset } from "./nft-data";
import { genesisAllocationPda } from "./program";

const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
/** mpl-core's `Key` discriminant for a plain asset account. */
const KEY_ASSET_V1 = 1;

/** A token's fixed-price run of fee-share NFTs, as the UI needs it. */
export interface GenesisGroupData {
  /** The group PDA — also the escrow that owns every unsold unit. */
  address: string;
  subjectMint: string;
  creator: string;
  collection: string;
  /** Lamports per unit. The protocol fee is charged on top. */
  price: bigint;
  /** Slice of the creator's fee stream each unit carries. */
  shareBps: number;
  totalUnits: number;
  mintedUnits: number;
  soldUnits: number;
  perWalletCap: number;
}

/**
 * Every open run.
 *
 * A closed group has no account left — `close_genesis_group` deletes it — so
 * "still listed" needs no flag and no filtering: what comes back is what can
 * still be bought from.
 */
export async function fetchGenesisGroups(
  program: Program<AttentionFi>,
): Promise<GenesisGroupData[]> {
  const all = await program.account.genesisGroup.all();
  return all.map(({ publicKey, account }) => ({
    address: publicKey.toBase58(),
    subjectMint: account.subjectMint.toBase58(),
    creator: account.creator.toBase58(),
    collection: account.collection.toBase58(),
    price: BigInt(account.price.toString()),
    shareBps: account.shareBps,
    totalUnits: account.totalUnits,
    mintedUnits: account.mintedUnits,
    soldUnits: account.soldUnits,
    perWalletCap: account.perWalletCap,
  }));
}

/** One unit of a run, as it sits in escrow. */
export interface GroupUnit {
  asset: string;
  name: string;
  uri?: string;
}

/**
 * The units a run still holds — minted, unsold, waiting in escrow.
 *
 * Read from the asset side by owner, because that is what the program checks:
 * `buy_genesis_unit` and `reclaim_genesis_units` both require the asset to be
 * owned by the group PDA, so anything this returns is something those calls
 * will accept. Deriving the list from `mintedUnits - soldUnits` instead would
 * give a count with no addresses, and the caller has to name an asset.
 */
export async function fetchGroupUnits(
  program: Program<AttentionFi>,
  group: PublicKey,
): Promise<GroupUnit[]> {
  const accounts = await program.provider.connection.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([KEY_ASSET_V1])) } },
      { memcmp: { offset: 1, bytes: group.toBase58() } },
    ],
  });

  const out: GroupUnit[] = [];
  for (const { pubkey, account } of accounts) {
    const decoded = decodeAsset(account.data);
    if (!decoded) continue;
    out.push({
      asset: pubkey.toBase58(),
      name: decoded.name || pubkey.toBase58().slice(0, 8),
      uri: decoded.uri || undefined,
    });
  }
  // Stable order so "the next unit" doesn't jump around between reads.
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
}

/**
 * How many units a wallet has already taken from a run.
 *
 * Zero when the allocation account doesn't exist, which is the common case —
 * it's created by the first purchase. Counts *purchases*, not holdings, so
 * selling a unit on doesn't refill the allowance.
 */
export async function fetchAllocation(
  program: Program<AttentionFi>,
  subjectMint: PublicKey,
  buyer: PublicKey,
): Promise<number> {
  try {
    const account = await program.account.genesisAllocation.fetchNullable(
      genesisAllocationPda(subjectMint, buyer),
    );
    return account?.units ?? 0;
  } catch {
    return 0;
  }
}
