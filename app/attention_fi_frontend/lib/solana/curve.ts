import { PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { auctionPda, convictionPda, curvePda, globalPda, revenuePda } from "./program";

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

// --- any-mechanism reader ---------------------------------------------------
// A token can be launched on any of four curves. They share a reserve model
// (bonding + conviction) or price fields (dutch + revenue); this collapses all
// four into one shape the token page can render regardless of mechanism.

export type Mechanism = "bonding" | "conviction" | "dutch" | "revenue";

export interface AnyCurve {
  mechanism: Mechanism;
  mint: string;
  creator: string;
  /** SOL per whole token. */
  spotPriceSol: number;
  /** Fully-diluted market cap in SOL. */
  marketCapSol: number;
  /** Real SOL raised into the curve/auction so far. */
  realSolReservesSol: number;
  tier: number;
  complete: boolean;
}

interface HasReserves {
  virtualSolReserves: { toString(): string };
  virtualTokenReserves: { toString(): string };
  realSolReserves: { toString(): string };
  tokenTotalSupply: { toString(): string };
  tier: number;
  complete: boolean;
}

function reservePrice(raw: HasReserves, decimals: number): { spot: number; mcap: number } {
  const vSol = Number(BigInt(raw.virtualSolReserves.toString())) / LAMPORTS_PER_SOL;
  const vTok = Number(BigInt(raw.virtualTokenReserves.toString())) / 10 ** decimals;
  const spot = vTok === 0 ? 0 : vSol / vTok;
  const supply = Number(BigInt(raw.tokenTotalSupply.toString())) / 10 ** decimals;
  return { spot, mcap: spot * supply };
}

/**
 * Read a token's curve regardless of which mechanism launched it. Fetches all
 * four candidate PDAs in parallel and returns the one that exists. Null when
 * the mint isn't launched on any of them.
 */
export async function fetchAnyCurve(
  program: Program<AttentionFi>,
  mint: PublicKey,
  decimals: number,
): Promise<AnyCurve | null> {
  const [bonding, conviction, dutch, revenue] = await Promise.all([
    program.account.bondingCurve.fetchNullable(curvePda(mint)).catch(() => null),
    program.account.convictionCurve.fetchNullable(convictionPda(mint)).catch(() => null),
    program.account.dutchAuction.fetchNullable(auctionPda(mint)).catch(() => null),
    program.account.revenueShare.fetchNullable(revenuePda(mint)).catch(() => null),
  ]);

  if (bonding) {
    const { spot, mcap } = reservePrice(bonding as unknown as HasReserves, decimals);
    return {
      mechanism: "bonding",
      mint: mint.toBase58(),
      creator: bonding.creator.toBase58(),
      spotPriceSol: spot,
      marketCapSol: mcap,
      realSolReservesSol: Number(BigInt(bonding.realSolReserves.toString())) / LAMPORTS_PER_SOL,
      tier: bonding.tier,
      complete: bonding.complete,
    };
  }
  if (conviction) {
    const { spot, mcap } = reservePrice(conviction as unknown as HasReserves, decimals);
    return {
      mechanism: "conviction",
      mint: mint.toBase58(),
      creator: conviction.creator.toBase58(),
      spotPriceSol: spot,
      marketCapSol: mcap,
      realSolReservesSol: Number(BigInt(conviction.realSolReserves.toString())) / LAMPORTS_PER_SOL,
      tier: conviction.tier,
      complete: conviction.complete,
    };
  }
  if (dutch) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const start = BigInt(dutch.startTime.toString());
    const duration = BigInt(Math.max(1, Number(dutch.duration.toString())));
    const elapsed = now > start ? now - start : 0n;
    const startPrice = BigInt(dutch.startPrice.toString());
    const floorPrice = BigInt(dutch.floorPrice.toString());
    const priceLamports =
      elapsed >= duration ? floorPrice : startPrice - ((startPrice - floorPrice) * elapsed) / duration;
    const spot = Number(priceLamports) / LAMPORTS_PER_SOL;
    const supply = Number(BigInt(dutch.totalForSale.toString())) / 10 ** decimals;
    return {
      mechanism: "dutch",
      mint: mint.toBase58(),
      creator: dutch.creator.toBase58(),
      spotPriceSol: spot,
      marketCapSol: spot * supply,
      realSolReservesSol: Number(BigInt(dutch.realSolReserves.toString())) / LAMPORTS_PER_SOL,
      tier: dutch.tier,
      complete: dutch.complete,
    };
  }
  if (revenue) {
    const spot = Number(BigInt(revenue.sharePrice.toString())) / LAMPORTS_PER_SOL;
    const supply = Number(BigInt(revenue.tokenTotalSupply.toString())) / 10 ** decimals;
    return {
      mechanism: "revenue",
      mint: mint.toBase58(),
      creator: revenue.creator.toBase58(),
      spotPriceSol: spot,
      marketCapSol: spot * supply,
      realSolReservesSol: Number(BigInt(revenue.revenueReserves.toString())) / LAMPORTS_PER_SOL,
      tier: revenue.tier,
      complete: false,
    };
  }
  return null;
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
