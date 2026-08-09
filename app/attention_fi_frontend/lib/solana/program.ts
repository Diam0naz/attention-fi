import { AnchorProvider, Program } from "@anchor-lang/core";
import {
  Connection,
  PublicKey,
  type Commitment,
  type RpcResponseAndContext,
  type SignatureResult,
  type Transaction,
  type TransactionConfirmationStrategy,
  type VersionedTransaction,
} from "@solana/web3.js";
import idlJson from "@/lib/idl/attention_fi.json";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { INDEXER_RPC_ENDPOINT, PROGRAM_ID, RPC_ENDPOINT, USE_RPC_PROXY } from "./config";

/** The slice of a wallet Anchor needs to sign. */
export interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

let cached: Connection | null = null;

export function getConnection(): Connection {
  // Fail fast on 429s instead of web3.js's internal retry loop spamming the
  // console — callers poll anyway, so the next wave picks up the data.
  if (!cached) {
    cached = new Connection(browserEndpoint(), {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
    });
    installPolledConfirmation(cached);
  }
  return cached;
}

/**
 * Confirm transactions by polling signature status instead of subscribing.
 *
 * web3.js confirms over a websocket, and it derives that websocket's URL from
 * the HTTP one by swapping the scheme and adding one to the port. Reads go
 * through `/api/rpc` so the provider key never reaches the browser, and there
 * is nothing listening on the origin's port + 1 — so `onSignature` never fired,
 * every confirmation ran out its 30-second timer, and the UI reported
 * "Transaction was not confirmed in 30.00 seconds" for transactions that had
 * already landed. Users were told their burn or delist had failed while the
 * explorer showed it succeeded, which is the one kind of wrong a wallet UI
 * cannot be: it invites people to retry an action that already happened.
 *
 * Patching the connection rather than the provider covers every caller —
 * Anchor's `.rpc()` reaches `confirmTransaction` through
 * `sendAndConfirmRawTransaction`, and the Switchboard feed path calls it
 * directly.
 *
 * Polling costs a handful of extra reads per transaction and works through the
 * proxy exactly as every other read does. The alternative — pointing the socket
 * at a public cluster endpoint — would confirm against a node other than the
 * one that accepted the transaction, on infrastructure with its own rate limits.
 */
function installPolledConfirmation(connection: Connection): void {
  const confirm = async (
    strategy: TransactionConfirmationStrategy | string,
    commitment: Commitment = "confirmed",
  ): Promise<RpcResponseAndContext<SignatureResult>> => {
    const signature = typeof strategy === "string" ? strategy : strategy.signature;
    // Present on the blockhash strategy Anchor uses; absent on the bare-signature
    // form, where the deadline below is the only bound.
    const lastValidBlockHeight =
      typeof strategy === "string" ? undefined : (strategy as { lastValidBlockHeight?: number })
          .lastValidBlockHeight;

    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    for (;;) {
      const statuses = await connection.getSignatureStatuses([signature]);
      const status = statuses.value[0];
      if (status && (status.err !== null || reached(status.confirmationStatus, commitment))) {
        return { context: statuses.context, value: { err: status.err } };
      }

      // A dropped transaction is the one case worth distinguishing: once its
      // blockhash can no longer be replayed the signature will never appear, so
      // saying so is honest rather than a guess about a timeout.
      if (lastValidBlockHeight !== undefined) {
        const height = await connection.getBlockHeight(commitment);
        if (height > lastValidBlockHeight) {
          throw new Error(
            `Transaction ${signature} expired before it was confirmed — it was not processed.`,
          );
        }
      }

      if (Date.now() > deadline) {
        throw new Error(
          `Transaction ${signature} was not confirmed in ${CONFIRM_TIMEOUT_MS / 1000}s. ` +
            `It may still land — check the signature before retrying.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
    }
  };

  // web3.js types the method through several overloads; the runtime only ever
  // calls the two shapes handled above.
  connection.confirmTransaction = confirm as Connection["confirmTransaction"];
}

/** How long to wait for a signature before giving up on it. */
const CONFIRM_TIMEOUT_MS = 90_000;
/** Gap between status reads while waiting. */
const CONFIRM_POLL_MS = 700;

/** Commitment levels in ascending order of certainty. */
const COMMITMENT_RANK: Record<string, number> = { processed: 0, confirmed: 1, finalized: 2 };

/** Whether a status has reached the commitment the caller asked for. */
function reached(status: string | null | undefined, wanted: Commitment): boolean {
  if (!status) return false;
  const have = COMMITMENT_RANK[status];
  const need = COMMITMENT_RANK[wanted] ?? COMMITMENT_RANK.confirmed;
  return have !== undefined && need !== undefined && have >= need;
}

/**
 * Where browser reads go.
 *
 * The proxy path has to be absolute because web3.js parses it as a URL, and it
 * only exists in the browser — on the server there is no origin to resolve it
 * against, and server code should use the upstream endpoint directly anyway.
 */
function browserEndpoint(): string {
  if (USE_RPC_PROXY && typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  return RPC_ENDPOINT;
}

let indexerCached: Connection | null = null;

/**
 * Connection for the indexer's history reads.
 *
 * Separate from `getConnection` so a keyed provider can absorb the
 * `getTransaction` volume a crawl needs without that key reaching the browser.
 * Retries on rate limits are left enabled here — unlike the UI, nothing is
 * waiting on this, and giving up costs a gap in the history rather than a
 * slightly stale panel.
 */
export function getIndexerConnection(): Connection {
  indexerCached ??= new Connection(INDEXER_RPC_ENDPOINT, { commitment: "confirmed" });
  return indexerCached;
}

/** Program for the indexer, bound to the history-read connection. */
export function getIndexerProgram(): Program<AttentionFi> {
  const stub: AnchorWalletLike = {
    publicKey: PublicKey.default,
    signTransaction: () => Promise.reject(new Error("read-only provider cannot sign")),
    signAllTransactions: () => Promise.reject(new Error("read-only provider cannot sign")),
  };
  const provider = new AnchorProvider(getIndexerConnection(), stub, { commitment: "confirmed" });
  return new Program(idlJson as AttentionFi, provider);
}

/** Program bound to a connected wallet — required for anything that signs. */
export function getProgram(wallet: AnchorWalletLike): Program<AttentionFi> {
  const provider = new AnchorProvider(getConnection(), wallet, { commitment: "confirmed" });
  return new Program(idlJson as AttentionFi, provider);
}

/**
 * Program for reads only. Anchor needs a wallet on the provider, but account
 * fetches never sign, so a throwing stub keeps misuse loud instead of silent.
 */
export function getReadonlyProgram(): Program<AttentionFi> {
  const stub: AnchorWalletLike = {
    publicKey: PublicKey.default,
    signTransaction: () => Promise.reject(new Error("read-only provider cannot sign")),
    signAllTransactions: () => Promise.reject(new Error("read-only provider cannot sign")),
  };
  const provider = new AnchorProvider(getConnection(), stub, { commitment: "confirmed" });
  return new Program(idlJson as AttentionFi, provider);
}

// --- PDAs (seeds mirror the program's constants) -----------------------------
// TextEncoder/toBytes rather than Buffer so this works in the browser without a
// Node polyfill.
const enc = new TextEncoder();

export const globalPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("global")], PROGRAM_ID)[0];

export const curvePda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("curve"), mint.toBytes()], PROGRAM_ID)[0];

/** Per-mechanism state PDAs (seeds mirror the program's constants). */
export const convictionPda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("conviction"), mint.toBytes()], PROGRAM_ID)[0];

export const auctionPda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("auction"), mint.toBytes()], PROGRAM_ID)[0];

export const revenuePda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("revenue"), mint.toBytes()], PROGRAM_ID)[0];

/** A holder's locked conviction stake in `mint`. */
export const positionPda = (mint: PublicKey, owner: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("position"), mint.toBytes(), owner.toBytes()],
    PROGRAM_ID,
  )[0];

/** A holder's revenue-share stake in `mint`. */
export const revStakePda = (mint: PublicKey, owner: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("revstake"), mint.toBytes(), owner.toBytes()],
    PROGRAM_ID,
  )[0];

/**
 * Fee pool shared by a token's genesis NFT holders.
 *
 * Always passed, never probed. The trading instructions take this as a required
 * account and read from the chain whether it exists, so an address for a pool
 * that was never created is fine — that emptiness is the answer.
 */
export const genesisPoolPda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("genpool"), mint.toBytes()], PROGRAM_ID)[0];

/**
 * A wallet's cumulative trading activity, which perk levels are gated on.
 *
 * Genuinely optional on the trading instructions, and unlike the genesis pool
 * it must be checked before being passed: Anchor deserialises an `Option`
 * account when one is supplied, so handing it the address of an account nobody
 * has opened fails the trade. Opened once via `openTraderStats`.
 */
export const traderStatsPda = (owner: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("trader"), owner.toBytes()], PROGRAM_ID)[0];

/** The record backing one perk NFT, keyed by its Core asset. */
export const perkPda = (asset: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("perk"), asset.toBytes()], PROGRAM_ID)[0];

/**
 * The emergency stop, and the guardians who hold it.
 *
 * Passed by every gated instruction and never optional — an optional stop is
 * not a stop. Empty until an authority installs a guardian set, which the
 * program reads as "not paused" rather than as an error, so the address is
 * always safe to send.
 */
export const guardiansPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("guardians")], PROGRAM_ID)[0];

/** A token's on-chain mindshare snapshot, written by `update_mindshare`. */
export const mindsharePda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("mindshare"), mint.toBytes()], PROGRAM_ID)[0];

/** A 1-of-1 asset's listing. */
export const nftAuctionPda = (asset: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("nftauction"), asset.toBytes()], PROGRAM_ID)[0];

/** A whole collection's listing. */
export const collectionAuctionPda = (collection: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("colauction"), collection.toBytes()],
    PROGRAM_ID,
  )[0];

/**
 * Paid placement on a listing, keyed by the asset or collection it promotes.
 *
 * Derived here rather than left to Anchor because `promote_listing` takes the
 * two auction accounts as optionals — exactly one is supplied, and Anchor does
 * not resolve optional accounts on the caller's behalf.
 */
export const promotionPda = (subject: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("promo"), subject.toBytes()], PROGRAM_ID)[0];

/** A token's fixed-price run of genesis fee-share NFTs. */
export const genesisGroupPda = (subjectMint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("gengroup"), subjectMint.toBytes()], PROGRAM_ID)[0];

/** How many units one wallet has taken from one token's run. */
export const genesisAllocationPda = (subjectMint: PublicKey, buyer: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("genalloc"), subjectMint.toBytes(), buyer.toBytes()],
    PROGRAM_ID,
  )[0];

/** The `GenesisNft` record backing one unit, keyed by its Core asset. */
export const genesisNftPda = (asset: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("genesis"), asset.toBytes()], PROGRAM_ID)[0];

/** Verification is keyed by the subject wallet, not the handle. */
export const verificationPda = (subject: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("verify"), subject.toBytes()], PROGRAM_ID)[0];

/** Singleton PDA holding the dedicated SAS attestation issuer key. */
export const issuerConfigPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("issuer")], PROGRAM_ID)[0];

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * The Metaplex metadata account for a launched mint.
 *
 * Every launch instruction writes real token metadata now, and this is the one
 * account Anchor cannot derive for us: it belongs to the Token Metadata
 * program, so the IDL carries no seeds for it and the client has to supply it.
 */
export const metadataPda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];

/** The NFT market's fee schedule — a singleton, so its seed is constant. */
export const feeConfigPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("feeconfig")], PROGRAM_ID)[0];

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Associated token account for (owner, mint). Works for PDA owners (off-curve). */
export const ata = (owner: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
