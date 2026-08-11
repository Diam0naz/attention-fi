/**
 * What a launched token is, resolved server-side for its metadata routes.
 *
 * Server-only: reaches the launch registry, which is Postgres.
 *
 * The split of sources is the point. Name, symbol and creator come off the
 * chain, because the chain is where they're authoritative — the launch wrote
 * them immutably and no later edit can move them. The registry supplies only
 * the artwork, which has nowhere on-chain to live.
 *
 * And the registry is trusted for that only when it agrees with the chain about
 * who launched the token. `launched_tokens` is keyed by handle, not by mint, so
 * nothing stops a second row naming someone else's mint — and `tokenByMint`
 * returns whichever row the database hands back first. Since a token's on-chain
 * `uri` points here permanently, an unchecked row would let any wallet choose
 * the picture a launched token shows in every wallet and explorer that reads
 * it. Matching the creator closes that: to supply the artwork you have to be
 * the address the launch instruction recorded.
 */
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/solana/config";
import {
  auctionPda,
  convictionPda,
  curvePda,
  getIndexerConnection,
  metadataPda,
  revenuePda,
} from "@/lib/solana/program";
import { tokenByMint, tokenDbConfigured } from "@/lib/token-db";

export type Mechanism = "bonding" | "dutch" | "conviction" | "revenue";

export interface TokenFacts {
  mint: string;
  /** From the on-chain Metaplex record, so it can't disagree with a wallet. */
  name: string;
  symbol: string;
  creator: string;
  mechanism: Mechanism;
  /** Artwork the creator attached at launch — only when the row is theirs. */
  image: string | null;
  /** The subject whose attention this token tracks, when known. */
  handle: string | null;
}

/**
 * Read a borsh `String` at `offset`, returning the value and the next offset.
 *
 * Metaplex pads these to their maximum length with NULs (it "puffs" the
 * account), so a raw read of a 4-character symbol comes back as "GOJO" plus six
 * invisible characters that survive into JSON and render as boxes.
 */
function readString(data: Buffer, offset: number): [string, number] {
  const len = data.readUInt32LE(offset);
  const start = offset + 4;
  const raw = data.subarray(start, start + len).toString("utf8");
  return [raw.replace(/\0+$/, "").trim(), start + len];
}

/**
 * Name and symbol from a Token Metadata account: key + update_authority + mint,
 * then the `Data` struct's three strings.
 */
function decodeMetadata(data: Buffer): { name: string; symbol: string } | null {
  try {
    const [name, afterName] = readString(data, 1 + 32 + 32);
    const [symbol] = readString(data, afterName);
    return { name, symbol };
  } catch {
    return null;
  }
}

/** Every launch account opens with `mint` then `creator`, after the discriminator. */
function readCreator(data: Buffer): string | null {
  try {
    return new PublicKey(data.subarray(8 + 32, 8 + 64)).toBase58();
  } catch {
    return null;
  }
}

/** The chain couldn't be reached — distinct from the token not existing. */
export class RpcUnavailable extends Error {}

/**
 * Resolve a mint, or null when it isn't a token this program launched.
 *
 * One `getMultipleAccountsInfo` rather than five fetches: which of the four
 * mechanisms launched a token is only knowable by looking, and asking serially
 * would mean four round trips to answer a question one can.
 *
 * Throws `RpcUnavailable` rather than returning null when the read itself
 * fails. Swallowing that would make an unreachable RPC indistinguishable from a
 * mint that was never launched, and the caller caches its answer — one timeout
 * would publish "this token does not exist" to every wallet reading it for the
 * next minute. A token's absence is a fact about the chain; a timeout is a fact
 * about us.
 */
export async function readTokenFacts(mintStr: string): Promise<TokenFacts | null> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr);
  } catch {
    return null;
  }

  const venues: { kind: Mechanism; pda: PublicKey }[] = [
    { kind: "bonding", pda: curvePda(mint) },
    { kind: "dutch", pda: auctionPda(mint) },
    { kind: "conviction", pda: convictionPda(mint) },
    { kind: "revenue", pda: revenuePda(mint) },
  ];

  const accounts = await getIndexerConnection()
    .getMultipleAccountsInfo([metadataPda(mint), ...venues.map((v) => v.pda)])
    .catch((e: unknown) => {
      throw new RpcUnavailable(e instanceof Error ? e.message : "read failed");
    });

  const [metaInfo, ...venueInfos] = accounts;
  const meta = metaInfo ? decodeMetadata(metaInfo.data) : null;
  if (!meta?.name) return null;

  const found = venues.findIndex(
    (_, i) => venueInfos[i]?.owner.equals(PROGRAM_ID) === true,
  );
  if (found === -1) return null;
  const creator = readCreator(venueInfos[found]!.data);
  if (!creator) return null;

  const row = tokenDbConfigured() ? await tokenByMint(mintStr).catch(() => null) : null;
  const mine = row?.creator === creator;

  return {
    mint: mintStr,
    name: meta.name,
    symbol: meta.symbol,
    creator,
    mechanism: venues[found]!.kind,
    image: mine ? (row?.image ?? null) : null,
    handle: mine ? (row?.handle ?? null) : null,
  };
}

/** Human-readable mechanism, for the metadata's attributes. */
export const MECHANISM_LABEL: Record<Mechanism, string> = {
  bonding: "Bonding curve",
  dutch: "Dutch auction",
  conviction: "Conviction",
  revenue: "Revenue share",
};
