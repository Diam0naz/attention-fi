import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/idl/attention_fi.json";

/** Cluster the app talks to. Override per-environment with NEXT_PUBLIC_* vars. */
export const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

/** Program ID — defaults to the address baked into the IDL. */
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? idl.address);

const explorerSuffix = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${explorerSuffix}`;
export const explorerAddress = (addr: string) =>
  `https://explorer.solana.com/address/${addr}${explorerSuffix}`;
