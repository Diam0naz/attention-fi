import { PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { curvePda, globalPda } from "./program";

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Raw on-chain bonding-curve state, normalised to JS numbers. */
export interface CurveState {
  mint: string;
  creator: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  creatorFees: bigint;
  tier: number;
  complete: boolean;
}

/**
 * Spot price in SOL per whole token, from virtual reserves.
 * Mirrors the program: price = virtual_sol / virtual_token.
 */
export function spotPriceSol(curve: CurveState, tokenDecimals: number): number {
  if (curve.virtualTokenReserves === 0n) return 0;
  const sol = Number(curve.virtualSolReserves) / LAMPORTS_PER_SOL;
  const tokens = Number(curve.virtualTokenReserves) / 10 ** tokenDecimals;
  return tokens === 0 ? 0 : sol / tokens;
}

/** Fully-diluted market cap in SOL (spot price x total supply). */
export function marketCapSol(curve: CurveState, tokenDecimals: number): number {
  const supply = Number(curve.tokenTotalSupply) / 10 ** tokenDecimals;
  return spotPriceSol(curve, tokenDecimals) * supply;
}

/**
 * Tokens out for a SOL buy, before fees — constant product:
 * dy = y - k/(x + dx). Mirrors the on-chain math (which rounds in the curve's
 * favour), so treat this as an estimate for display only.
 */
export function quoteBuy(curve: CurveState, solIn: number): number {
  if (solIn <= 0) return 0;
  const x = Number(curve.virtualSolReserves);
  const y = Number(curve.virtualTokenReserves);
  const dx = solIn * LAMPORTS_PER_SOL;
  const k = x * y;
  return y - k / (x + dx);
}

/** SOL out for a token sell, before fees. */
export function quoteSell(curve: CurveState, tokensIn: number): number {
  if (tokensIn <= 0) return 0;
  const x = Number(curve.virtualSolReserves);
  const y = Number(curve.virtualTokenReserves);
  const k = x * y;
  return (x - k / (y + tokensIn)) / LAMPORTS_PER_SOL;
}

type RawCurve = Awaited<ReturnType<Program<AttentionFi>["account"]["bondingCurve"]["fetch"]>>;

function normalise(raw: RawCurve): CurveState {
  return {
    mint: raw.mint.toBase58(),
    creator: raw.creator.toBase58(),
    virtualSolReserves: BigInt(raw.virtualSolReserves.toString()),
    virtualTokenReserves: BigInt(raw.virtualTokenReserves.toString()),
    realSolReserves: BigInt(raw.realSolReserves.toString()),
    realTokenReserves: BigInt(raw.realTokenReserves.toString()),
    tokenTotalSupply: BigInt(raw.tokenTotalSupply.toString()),
    creatorFees: BigInt(raw.creatorFees.toString()),
    tier: raw.tier,
    complete: raw.complete,
  };
}

/** Fetch one curve by mint. Returns null when the token isn't on-chain. */
export async function fetchCurve(
  program: Program<AttentionFi>,
  mint: PublicKey,
): Promise<CurveState | null> {
  try {
    const raw = await program.account.bondingCurve.fetch(curvePda(mint));
    return normalise(raw);
  } catch {
    return null; // not found / not deployed
  }
}

/** Fetch every launched curve. Returns [] when the program has no data yet. */
export async function fetchAllCurves(program: Program<AttentionFi>): Promise<CurveState[]> {
  try {
    const all = await program.account.bondingCurve.all();
    return all.map((a) => normalise(a.account));
  } catch {
    return [];
  }
}

/** Global config (fees, graduation threshold, decimals). Null if uninitialised. */
export async function fetchGlobal(program: Program<AttentionFi>) {
  try {
    const g = await program.account.global.fetch(globalPda());
    return {
      authority: g.authority.toBase58(),
      treasury: g.treasury.toBase58(),
      feeBps: g.feeBps,
      creatorFeeShareBps: g.creatorFeeShareBps,
      graduationSol: BigInt(g.graduationSol.toString()),
      tokenDecimals: g.tokenDecimals,
      tokensLaunched: BigInt(g.tokensLaunched.toString()),
    };
  } catch {
    return null;
  }
}
