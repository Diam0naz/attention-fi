import { Keypair, PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { perkPda, traderStatsPda } from "./program";

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Cumulative activity each perk level requires, mirroring
 * `PERK_LEVEL_ACTIVITY_LAMPORTS` in the program.
 *
 * Duplicated rather than read from the IDL because Anchor only exposes
 * `#[constant]` values and this array isn't one. The program is the authority:
 * every gate is enforced on-chain, so the worst a drift here can do is show the
 * wrong target, never grant the wrong level.
 */
export const PERK_THRESHOLDS_SOL = [1, 5, 20, 75, 250] as const;

export const MAX_PERK_LEVEL = PERK_THRESHOLDS_SOL.length;

export interface TraderActivity {
  /** Cumulative SOL traded. */
  volumeSol: number;
  /** Cumulative SOL committed to conviction locks and revenue shares. */
  depositsSol: number;
  /** What the ladder is measured against: volume + deposits × 2. */
  scoreSol: number;
  /** Highest level this score has earned, 0 through 5. */
  earnedLevel: number;
  /** SOL still needed for the next rung, or null at the ceiling. */
  toNextSol: number | null;
}

/** Highest level `scoreSol` clears — the client-side mirror of `level_for_score`. */
export function levelForScore(scoreSol: number): number {
  let level = 0;
  for (const [i, required] of PERK_THRESHOLDS_SOL.entries()) {
    if (scoreSol >= required) level = i + 1;
    else break;
  }
  return level;
}

/**
 * Read a wallet's activity record, or null when they haven't opened one.
 *
 * Null is the ordinary case for a new wallet, not an error — and it's the
 * signal the trading path needs, since passing the address of an account that
 * was never opened fails the whole trade.
 */
export async function fetchTraderActivity(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<TraderActivity | null> {
  const raw = await program.account.traderStats.fetchNullable(traderStatsPda(owner));
  if (!raw) return null;

  const volumeSol = Number(raw.volumeLamports.toString()) / LAMPORTS_PER_SOL;
  const depositsSol = Number(raw.depositsLamports.toString()) / LAMPORTS_PER_SOL;
  // Deposits count double, matching `TraderStats::activity_score`: committing
  // capital is a stronger signal than a trade that can be undone next block.
  const scoreSol = volumeSol + depositsSol * 2;
  const earnedLevel = levelForScore(scoreSol);
  const next = PERK_THRESHOLDS_SOL[earnedLevel];

  return {
    volumeSol,
    depositsSol,
    scoreSol,
    earnedLevel,
    toNextSol: next === undefined ? null : Math.max(0, next - scoreSol),
  };
}

/**
 * Whether this wallet's stats account can be passed to a trade.
 *
 * Cheaper than `fetchTraderActivity` where only existence matters, and used on
 * the trading path where the answer decides between the PDA and null.
 */
export async function hasTraderStats(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<boolean> {
  const info = await program.provider.connection.getAccountInfo(traderStatsPda(owner));
  return info !== null;
}

/** Open the activity record. One-time, self-funded, permissionless. */
export async function openTraderStats(
  program: Program<AttentionFi>,
  owner: PublicKey,
): Promise<string> {
  return program.methods
    .openTraderStats()
    .accountsPartial({ owner, stats: traderStatsPda(owner) })
    .rpc();
}

/**
 * Mint your own perk at the level your trading has earned.
 *
 * No grant and no authority signature — the program checks the score.
 *
 * `uriFor` receives the generated asset address rather than the caller passing
 * a finished string: the metadata route is keyed by asset, and the keypair only
 * exists here, so a caller building the URL itself would have to mint first and
 * then be unable to write it. Mirrors how `claimPerk` does it.
 */
export async function claimEarnedPerk(
  program: Program<AttentionFi>,
  owner: PublicKey,
  uriFor: (asset: PublicKey) => string,
): Promise<{ signature: string; asset: PublicKey }> {
  const asset = Keypair.generate();
  const signature = await program.methods
    .claimEarnedPerk(uriFor(asset.publicKey))
    .accountsPartial({
      recipient: owner,
      stats: traderStatsPda(owner),
      perk: perkPda(asset.publicKey),
      asset: asset.publicKey,
    })
    .signers([asset])
    .rpc();
  return { signature, asset: asset.publicKey };
}

/** Move a perk up one rung, on the holder's own activity. */
export async function levelUpPerk(
  program: Program<AttentionFi>,
  owner: PublicKey,
  asset: PublicKey,
): Promise<string> {
  return program.methods
    .levelUp()
    .accountsPartial({
      owner,
      stats: traderStatsPda(owner),
      perk: perkPda(asset),
      asset,
    })
    .rpc();
}
