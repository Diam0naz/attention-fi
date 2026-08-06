import type { Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { PROGRAM_ID } from "@/lib/solana/config";

/**
 * The post-graduation venue.
 *
 * A completed bonding curve refuses both buys and sells, so until its liquidity
 * is migrated the token cannot be traded anywhere. That migration is `graduate`,
 * and everything after it goes through `swap` against this pool.
 */
export interface PoolState {
  mint: string;
  solReserves: bigint;
  tokenReserves: bigint;
}

const AMM_SEED = "amm";

export function poolPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(AMM_SEED), mint.toBuffer()],
    new PublicKey(PROGRAM_ID),
  )[0];
}

/** The pool for a mint, or null when the curve hasn't been graduated yet. */
export async function fetchPool(
  program: Program<AttentionFi>,
  mint: PublicKey,
): Promise<PoolState | null> {
  try {
    const account = await program.account.ammPool.fetch(poolPda(mint));
    return {
      mint: account.mint.toBase58(),
      solReserves: BigInt(account.solReserves.toString()),
      tokenReserves: BigInt(account.tokenReserves.toString()),
    };
  } catch {
    return null;
  }
}

/** Every pool, for surfaces that price many tokens at once. */
export async function fetchAllPools(program: Program<AttentionFi>): Promise<PoolState[]> {
  try {
    const all = await program.account.ammPool.all();
    return all.map((a) => ({
      mint: a.account.mint.toBase58(),
      solReserves: BigInt(a.account.solReserves.toString()),
      tokenReserves: BigInt(a.account.tokenReserves.toString()),
    }));
  } catch {
    return [];
  }
}

/** Integer division rounding up, mirroring `curve::ceil_div`. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return b === 0n ? 0n : (a + b - 1n) / b;
}

/**
 * Constant-product quote, mirroring `amm::swap_quote` exactly — including its
 * rounding.
 *
 * The program skims the fee from the input, then rounds the *new output
 * reserve* up so the trader receives slightly less and the pool is never
 * over-drawn. Rounding the other way here would quote a number the chain then
 * refuses to honour, which surfaces as a slippage failure the trader can't
 * explain.
 */
export function swapQuote(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps: number,
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const fee = (amountIn * BigInt(feeBps)) / 10_000n;
  const inAfterFee = amountIn - fee;
  const k = reserveIn * reserveOut;
  const newIn = reserveIn + inAfterFee;
  const newOut = ceilDiv(k, newIn);
  return reserveOut > newOut ? reserveOut - newOut : 0n;
}

/** Spot price in SOL per whole token, from pool reserves. */
export function poolSpotSol(pool: PoolState, decimals: number): number {
  if (pool.tokenReserves === 0n) return 0;
  const tokens = Number(pool.tokenReserves) / 10 ** decimals;
  return Number(pool.solReserves) / 1e9 / tokens;
}

// Sending a `swap` or `graduate` transaction lives in ./venue, alongside the
// curve's buy/sell — the point of that module is that a screen picks a venue
// once and cannot quote one while submitting to the other.
