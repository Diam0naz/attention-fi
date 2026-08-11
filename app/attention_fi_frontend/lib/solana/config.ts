import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/idl/attention_fi.json";

/** Cluster the app talks to. Override per-environment with NEXT_PUBLIC_* vars. */
export const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

/**
 * Server-only endpoint for the event indexer.
 *
 * The crawl issues one `getTransaction` per signature, which public RPCs
 * rate-limit far more aggressively than account reads — devnet answers "Too
 * many requests for a specific RPC call" after roughly ten in a row. That is
 * enough to make a backlog of a few hundred transactions effectively
 * un-crawlable, and it looks from the outside like a program nobody has used.
 *
 * Kept separate from RPC_ENDPOINT, and deliberately not NEXT_PUBLIC_: this one
 * is called from route handlers only, so it can hold a keyed provider URL
 * without shipping the key to every browser. Falls back to the shared endpoint
 * when unset, so nothing breaks — it just stays slow.
 */
export const INDEXER_RPC_ENDPOINT = process.env.INDEXER_RPC_ENDPOINT || RPC_ENDPOINT;

/**
 * Endpoint the /api/rpc proxy forwards to. Server-only, same reasoning.
 * Reuses the indexer's endpoint, which is already the keyed one.
 */
export const SERVER_RPC_ENDPOINT = INDEXER_RPC_ENDPOINT;

/**
 * Route browser reads through /api/rpc instead of straight to RPC_ENDPOINT.
 *
 * Opt-in so a deployment without a keyed upstream keeps working unchanged —
 * proxying to the same public endpoint would add a hop and fix nothing.
 */
export const USE_RPC_PROXY = process.env.NEXT_PUBLIC_USE_RPC_PROXY === "1";

/** Program ID — defaults to the address baked into the IDL. */
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? idl.address);

/**
 * USDC mint. Defaults to Circle's devnet USDC; override per-cluster.
 *
 * The previous default (4zMMC9sr…) is not a live account on devnet, so the
 * balance hook looked up an associated account of a mint that doesn't exist,
 * found nothing, and left the profile showing "…" indefinitely. Verified
 * on-chain: this address is a Token-program mint with 6 decimals.
 */
export const USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ?? "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";

/**
 * Fee discount granted per perk level, in basis points **of the trading fee**
 * — 1000 means a level-1 perk pays 90% of the going fee.
 *
 * Mirrors `DISCOUNT_PER_LEVEL_BPS` in programs/attention_fi/src/constants.rs.
 * That one isn't marked `#[constant]`, so it never reaches the IDL and this
 * copy has to be kept in step by hand.
 */
export const DISCOUNT_PER_LEVEL_BPS = 1000;

/**
 * Canonical public origin, used to build NFT metadata URIs.
 *
 * This matters more than a normal base-url setting: a verification NFT's `uri`
 * is written on-chain at mint time and is effectively permanent. Deriving it
 * from `window.location.origin` would bake whatever host the user happened to
 * mint from — a preview deployment, or localhost — into the asset forever. So
 * set NEXT_PUBLIC_APP_URL on any deployment that mints; the origin fallback is
 * only a convenience for local development.
 */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

/** Metadata URI for a verification NFT, resolved dynamically so skins can change. */
export const verificationMetadataUri = (subject: string) =>
  `${appOrigin()}/api/verification/${subject}`;

/**
 * Metadata URI written into a launched token's on-chain record.
 *
 * Permanent in a stronger sense than the verification badge: launch metadata is
 * created `is_mutable = false`, so this string is fixed for the life of the
 * token and no authority can rewrite it. Keep the deployment's
 * NEXT_PUBLIC_APP_URL right before launching anything you intend to keep — the
 * program caps the field at 200 characters, which an origin plus a 44-character
 * mint leaves enormous room under, but a wrong host is unfixable.
 */
export const tokenMetadataUri = (mint: string) => `${appOrigin()}/api/token/${mint}`;

const explorerSuffix = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${explorerSuffix}`;
export const explorerAddress = (addr: string) =>
  `https://explorer.solana.com/address/${addr}${explorerSuffix}`;
