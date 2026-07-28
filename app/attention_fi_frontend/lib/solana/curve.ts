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

/** Dutch-auction price at `nowSec`, mirroring the program's linear descent. */
export function linearDescentLamports(
  startPrice: bigint,
  floorPrice: bigint,
  startTime: bigint,
  duration: bigint,
  nowSec: bigint,
): bigint {
  const dur = duration <= 0n ? 1n : duration;
  const elapsed = nowSec > startTime ? nowSec - startTime : 0n;
  return elapsed >= dur ? floorPrice : startPrice - ((startPrice - floorPrice) * elapsed) / dur;
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
    const priceLamports = linearDescentLamports(
      BigInt(dutch.startPrice.toString()),
      BigInt(dutch.floorPrice.toString()),
      BigInt(dutch.startTime.toString()),
      BigInt(dutch.duration.toString()),
      BigInt(Math.floor(Date.now() / 1000)),
    );
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

/** One price sample for the history store, for a token on any mechanism. */
export interface SnapshotRow {
  mint: string;
  priceSol: number;
  realSolLamports: bigint;
}

/**
 * A spot-price sample for every launched token across all four mechanisms, so
 * chart history accrues regardless of how a token was launched (the recorder
 * used to see bonding curves only).
 */
export async function fetchAllSnapshotRows(
  program: Program<AttentionFi>,
  decimals: number,
): Promise<SnapshotRow[]> {
  const [bonding, conviction, dutch, revenue] = await Promise.all([
    program.account.bondingCurve.all().catch(() => []),
    program.account.convictionCurve.all().catch(() => []),
    program.account.dutchAuction.all().catch(() => []),
    program.account.revenueShare.all().catch(() => []),
  ]);
  const rows: SnapshotRow[] = [];
  for (const { account: c } of bonding) {
    rows.push({
      mint: c.mint.toBase58(),
      priceSol: reservePrice(c as unknown as HasReserves, decimals).spot,
      realSolLamports: BigInt(c.realSolReserves.toString()),
    });
  }
  for (const { account: c } of conviction) {
    rows.push({
      mint: c.mint.toBase58(),
      priceSol: reservePrice(c as unknown as HasReserves, decimals).spot,
      realSolLamports: BigInt(c.realSolReserves.toString()),
    });
  }
  for (const { account: c } of dutch) {
    const priceLamports = linearDescentLamports(
      BigInt(c.startPrice.toString()),
      BigInt(c.floorPrice.toString()),
      BigInt(c.startTime.toString()),
      BigInt(c.duration.toString()),
      BigInt(Math.floor(Date.now() / 1000)),
    );
    rows.push({
      mint: c.mint.toBase58(),
      priceSol: Number(priceLamports) / LAMPORTS_PER_SOL,
      realSolLamports: BigInt(c.realSolReserves.toString()),
    });
  }
  for (const { account: c } of revenue) {
    rows.push({
      mint: c.mint.toBase58(),
      priceSol: Number(BigInt(c.sharePrice.toString())) / LAMPORTS_PER_SOL,
      realSolLamports: BigInt(c.revenueReserves.toString()),
    });
  }
  return rows;
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

/**
 * Dutch-auction detail for the trade panel. `AnyCurve` deliberately flattens
 * every mechanism to a common display shape; bidding needs the auction's own
 * schedule (descent, remaining allocation, end time), so it's read separately.
 */
export interface AuctionDetail {
  mint: string;
  creator: string;
  /** Lamports per whole token. */
  startPriceLamports: bigint;
  floorPriceLamports: bigint;
  /** Current price on the descent, lamports per whole token. */
  priceLamports: bigint;
  priceSol: number;
  startTime: number;
  /** Seconds. */
  duration: number;
  endTime: number;
  /** Base units. */
  totalForSale: bigint;
  tokensSold: bigint;
  remaining: bigint;
  /** Whole tokens, for display. */
  remainingTokens: number;
  soldPct: number;
  proceedsSol: number;
  complete: boolean;
  ended: boolean;
}

export async function fetchAuctionDetail(
  program: Program<AttentionFi>,
  mint: PublicKey,
  decimals: number,
): Promise<AuctionDetail | null> {
  const raw = await program.account.dutchAuction
    .fetchNullable(auctionPda(mint))
    .catch(() => null);
  if (!raw) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const startTime = Number(raw.startTime.toString());
  const duration = Number(raw.duration.toString());
  const priceLamports = linearDescentLamports(
    BigInt(raw.startPrice.toString()),
    BigInt(raw.floorPrice.toString()),
    BigInt(startTime),
    BigInt(duration),
    BigInt(nowSec),
  );
  const totalForSale = BigInt(raw.totalForSale.toString());
  const tokensSold = BigInt(raw.tokensSold.toString());
  const remaining = totalForSale > tokensSold ? totalForSale - tokensSold : 0n;
  const endTime = startTime + duration;

  return {
    mint: mint.toBase58(),
    creator: raw.creator.toBase58(),
    startPriceLamports: BigInt(raw.startPrice.toString()),
    floorPriceLamports: BigInt(raw.floorPrice.toString()),
    priceLamports,
    priceSol: Number(priceLamports) / LAMPORTS_PER_SOL,
    startTime,
    duration,
    endTime,
    totalForSale,
    tokensSold,
    remaining,
    remainingTokens: Number(remaining) / 10 ** decimals,
    soldPct: totalForSale === 0n ? 0 : Number((tokensSold * 10_000n) / totalForSale) / 100,
    proceedsSol: Number(BigInt(raw.realSolReserves.toString())) / LAMPORTS_PER_SOL,
    complete: raw.complete,
    ended: nowSec >= endTime,
  };
}

/**
 * Cost of buying `amountBaseUnits` at `priceLamports`, mirroring the program's
 * `auction_quote` exactly — including its round-UP, so the client never quotes
 * less than the chain will charge.
 */
export function auctionQuote(
  priceLamports: bigint,
  amountBaseUnits: bigint,
  decimals: number,
  feeBps: number,
): { costLamports: bigint; feeLamports: bigint; totalLamports: bigint } {
  const scale = 10n ** BigInt(decimals);
  const numerator = priceLamports * amountBaseUnits;
  const costLamports = scale === 0n ? 0n : (numerator + scale - 1n) / scale;
  const feeLamports = (costLamports * BigInt(feeBps)) / 10_000n;
  return { costLamports, feeLamports, totalLamports: costLamports + feeLamports };
}
