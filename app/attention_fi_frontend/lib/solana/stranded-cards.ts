/**
 * Cards still sitting with a seller after the collection around them was sold.
 *
 * Before the escrow fix, `buy_collection` moved only the collection's update
 * authority. Each member asset has its own `owner`, and that field was never
 * touched — so buyers paid for decks whose cards stayed in the seller's wallet.
 * New sales cannot do this, but the ones that already happened are still wrong,
 * and only the seller can sign the transfers that put them right.
 *
 * Derived rather than hardcoded: anything this finds is, by construction, a
 * card whose collection someone else now controls under a settled listing. The
 * list empties itself once delivered and stays empty, so this can be deleted
 * whenever the historical sales have been cleared.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { collectionAuctionPda } from "./program";

const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const KEY_ASSET_V1 = 1;
const AUTHORITY_COLLECTION = 2;

export interface StrandedCard {
  asset: string;
  name: string;
  collection: string;
  /** Who the collection now belongs to — where this card should go. */
  owedTo: string;
}

/**
 * Build an mpl-core `TransferV1`.
 *
 * Hand-rolled because the JS SDK isn't a dependency and this is the only Core
 * instruction the app sends directly. The layout is taken from mpl-core 0.11.2,
 * the version the program links against: a one-byte discriminator (14) followed
 * by `compression_proof: Option<CompressionProof>`, which is None here. Absent
 * optional accounts are passed as the program's own id, which is how the Rust
 * builder encodes them.
 */
export function transferV1(
  asset: PublicKey,
  collection: PublicKey,
  owner: PublicKey,
  newOwner: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: MPL_CORE_PROGRAM_ID,
    keys: [
      { pubkey: asset, isSigner: false, isWritable: true },
      { pubkey: collection, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: true, isWritable: true }, // payer
      { pubkey: owner, isSigner: true, isWritable: false }, // authority
      { pubkey: newOwner, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false }, // log_wrapper: none
    ],
    data: Buffer.from([14, 0]),
  });
}

/** Decode an asset's name, for showing which card is which. */
function assetName(data: Buffer): string {
  try {
    let o = 1 + 32;
    o += data.readUInt8(o) === 0 ? 1 : 33; // UpdateAuthority
    const len = data.readUInt32LE(o);
    return data.subarray(o + 4, o + 4 + len).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Every card this wallet holds that belongs to a collection it no longer
 * controls, where the listing that moved it is settled.
 *
 * The settled-listing check is what keeps this honest. Holding a card from
 * someone else's collection is perfectly normal — you can buy a single piece
 * out of a deck. What is not normal is holding one when a *completed
 * collection sale* transferred the deck around it, and that is the pair of
 * facts this looks for.
 */
export async function findStrandedCards(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<StrandedCard[]> {
  const conn = program.provider.connection;
  const owned = await conn.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([KEY_ASSET_V1])) } },
      { memcmp: { offset: 1, bytes: owner.toBase58() } },
    ],
  });

  // Group by collection so each one is examined once, however many cards it has.
  const byCollection = new Map<string, { asset: string; name: string }[]>();
  for (const { pubkey, account } of owned) {
    const d = account.data;
    if (d.length < 66 || d.readUInt8(33) !== AUTHORITY_COLLECTION) continue;
    const collection = new PublicKey(d.subarray(34, 66)).toBase58();
    const list = byCollection.get(collection) ?? [];
    list.push({ asset: pubkey.toBase58(), name: assetName(d) || pubkey.toBase58().slice(0, 8) });
    byCollection.set(collection, list);
  }
  if (byCollection.size === 0) return [];

  const collections = [...byCollection.keys()];
  const [collInfos, auctionInfos] = await Promise.all([
    conn.getMultipleAccountsInfo(collections.map((c) => new PublicKey(c))),
    conn.getMultipleAccountsInfo(collections.map((c) => collectionAuctionPda(new PublicKey(c)))),
  ]);

  const out: StrandedCard[] = [];
  for (const [i, collection] of collections.entries()) {
    const info = collInfos[i];
    const auction = auctionInfos[i];
    if (!info || !auction) continue;

    const authority = new PublicKey(info.data.subarray(1, 33)).toBase58();
    if (authority === owner.toBase58()) continue; // still ours; nothing owed

    // CollectionAuction: disc(8) collection(32) creator(32) start(8) floor(8)
    // start_time(8) duration(8) complete(1)
    const complete = auction.data[8 + 32 + 32 + 8 + 8 + 8 + 8] === 1;
    if (!complete) continue; // a live listing is escrow, not a stranding

    for (const card of byCollection.get(collection)!) {
      out.push({ ...card, collection, owedTo: authority });
    }
  }
  return out;
}
