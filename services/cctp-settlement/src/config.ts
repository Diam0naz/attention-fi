// Configuration for the CCTP settlement keeper. Values come from env so no keys
// or endpoints are committed. See README for the required variables.

import type { Network } from "@wormhole-foundation/sdk";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

export interface SettlementConfig {
  /** "Mainnet" | "Testnet" — Wormhole/Circle network. */
  network: Network;
  /** Wormhole chain name for the destination (Circle's Arc, once registered). */
  destChain: string;
  /** USDC amount to bridge, in whole USDC (e.g. "25.5"). */
  amountUsdc: string;
  /** Destination (Arc) recipient address. */
  arcRecipient: string;
  /** Solana keeper secret key (JSON array or base58), holding the USDC to burn. */
  solanaKey: string;
  /** Arc/EVM keeper private key, used to submit receiveMessage. */
  arcKey: string;
}

export function loadConfig(): SettlementConfig {
  return {
    network: (process.env.CCTP_NETWORK ?? "Testnet") as Network,
    // NOTE: Arc must be a chain the CCTP layer recognises. If the Wormhole SDK's
    // registry does not yet include Circle's Arc, target it via Circle's raw CCTP
    // domain id instead (see README) — this string is the integration seam.
    destChain: process.env.ARC_CHAIN_NAME ?? "Arc",
    amountUsdc: req("SETTLE_AMOUNT_USDC"),
    arcRecipient: req("ARC_RECIPIENT"),
    solanaKey: req("SOLANA_KEEPER_KEY"),
    arcKey: req("ARC_KEEPER_KEY"),
  };
}

// Public CCTP program ids on Solana (for reference / raw-Circle fallback).
export const SOLANA_CCTP = {
  tokenMessengerMinter: "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3",
  messageTransmitter: "CCTPmbSPurZoD7yGPjmQdb2fKZffTPTWzUJj9jFuoytoY",
} as const;
