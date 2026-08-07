import { AnchorProvider, Program } from "@anchor-lang/core";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import idlJson from "@/lib/idl/attention_fi.json";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { INDEXER_RPC_ENDPOINT, PROGRAM_ID, RPC_ENDPOINT } from "./config";

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
  cached ??= new Connection(RPC_ENDPOINT, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
  return cached;
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

/** Verification is keyed by the subject wallet, not the handle. */
export const verificationPda = (subject: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("verify"), subject.toBytes()], PROGRAM_ID)[0];

/** Singleton PDA holding the dedicated SAS attestation issuer key. */
export const issuerConfigPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("issuer")], PROGRAM_ID)[0];

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Associated token account for (owner, mint). Works for PDA owners (off-curve). */
export const ata = (owner: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
