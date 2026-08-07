"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { getConnection } from "@/lib/solana/program";
import { quoteSell, spotPriceSol } from "@/lib/solana/curve";
import { poolSpotSol, swapQuote } from "@/lib/solana/amm";
import { fetchWalletPositions } from "@/lib/solana/positions";
import { solUsd } from "@/lib/solana/sol-usd";

export interface Holding {
  handle: string;
  symbol: string;
  name: string;
  mint: string;
  /** Whole tokens held. */
  amount: number;
  /**
   * SOL this position would actually realise if sold right now, in one go.
   *
   * Deliberately not `spot * amount`. On a bonding curve, selling walks the
   * price back down it, so spot is the price of the *first* token out and
   * overstates everything after it. The gap widens with position size and
   * narrows with reserves, so the naive figure is most wrong exactly where it
   * matters most — a large holder in a thin market.
   */
  valueSol: number;
  valueUsd: number;
  /** Spot price per token, for reference against the realisable figure. */
  spotSol: number;
  /** How much less the position fetches than spot implies, as a fraction. */
  slippage: number;
  /** True once the AMM pool exists — pricing then lives there, not the curve. */
  graduated: boolean;
  /**
   * Complete but not yet migrated: the curve has stopped and the pool doesn't
   * exist, so this position cannot be sold at any price until someone runs the
   * migration. A value with no way to realise it needs saying out loud.
   */
  stranded: boolean;
}

export interface HoldingsState {
  holdings: Holding[];
  totalUsd: number;
  /**
   * Creator fees accrued to this wallet across the tokens it launched, in USD.
   *
   * Read from each curve's `creatorFees`, which is the amount the program has
   * actually set aside — not an estimate from volume. Claiming is separately
   * gated on SAS verification, so this can be non-zero for a wallet that
   * can't yet withdraw it.
   */
  claimableUsd: number;
  /** False until the first read completes, so "none" and "not read" differ. */
  loaded: boolean;
}

const EMPTY: HoldingsState = { holdings: [], totalUsd: 0, claimableUsd: 0, loaded: false };

/**
 * What the connected wallet actually holds of AttentionFi tokens, priced off
 * the live venue.
 *
 * Replaces a mock that generated holdings deterministically from the wallet
 * address — stable across reloads and plausible-looking, which is the worst
 * way to be wrong.
 */
export function useHoldings(nonce = 0): HoldingsState {
  const { address } = useWallet();
  const readonly = useReadonlyProgram();
  // Keyed by wallet and derived during render, so switching wallets can never
  // show the previous one's positions while the new read is in flight.
  const [snapshot, setSnapshot] = useState<{ key: string; state: HoldingsState } | null>(null);
  const key = `${address ?? ""}:${nonce}`;

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    const load = async () => {
      try {
        const owner = new PublicKey(address);
        const { positions, decimals, feeBps, claimableLamports } = await fetchWalletPositions(
          readonly,
          getConnection(),
          owner,
        );
        if (cancelled) return;

        const usdRate = solUsd();
        const holdings: Holding[] = [];
        for (const p of positions) {
          const base = BigInt(Math.floor(p.amount * 10 ** decimals));

          // Which venue prices this depends on whether it graduated. After
          // graduation the curve's *real* reserves are zero — every lamport
          // moved into the pool — so its spot is a leftover of the virtual
          // reserves and describes a market that no longer exists. Pricing a
          // graduated position off the curve reports a number nobody can trade
          // at, which is precisely the mistake that stranded one already.
          let spot: number;
          let realisable: number;
          if (p.pool) {
            spot = poolSpotSol(p.pool, decimals);
            // Gross from the curve, then the fee off the proceeds — the same
            // order `swap_handler` uses. Skimming the token input instead
            // would report a figure the pool would never pay.
            const gross =
              Number(swapQuote(p.pool.tokenReserves, p.pool.solReserves, base, 0)) / 1e9;
            realisable = gross * (1 - feeBps / 10_000);
          } else {
            spot = spotPriceSol(p.curve, decimals);
            // Net of the trading fee, which `quoteSell` doesn't apply: the
            // point of this figure is what lands in the wallet, and the fee
            // comes out before it does.
            realisable = quoteSell(p.curve, p.amount * 10 ** decimals) * (1 - feeBps / 10_000);
          }
          // A stranded position can't be sold at all, so its realisable value
          // is zero in the strictest sense. It isn't reported that way: the
          // migration is one permissionless transaction away, and writing off
          // a holding that anyone can unlock in a click would be the larger
          // lie. The flag carries the caveat instead.
          const naive = spot * p.amount;

          holdings.push({
            handle: p.meta?.handle ?? p.mint.slice(0, 6),
            symbol: p.meta?.symbol ?? p.mint.slice(0, 4).toUpperCase(),
            name: p.meta?.name ?? p.mint,
            mint: p.mint,
            amount: p.amount,
            valueSol: realisable,
            valueUsd: realisable * usdRate,
            spotSol: spot,
            slippage: naive > 0 ? Math.max(0, (naive - realisable) / naive) : 0,
            graduated: p.venue === "pool",
            stranded: p.venue === "stranded",
          });
        }

        holdings.sort((a, b) => b.valueUsd - a.valueUsd);
        const totalUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
        const claimableUsd = (Number(claimableLamports) / 1e9) * usdRate;

        if (!cancelled) {
          setSnapshot({
            key: `${address}:${nonce}`,
            state: { holdings, totalUsd, claimableUsd, loaded: true },
          });
        }
      } catch {
        if (!cancelled) {
          setSnapshot({ key: `${address}:${nonce}`, state: { ...EMPTY, loaded: true } });
        }
      }
    };

    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, readonly, nonce]);

  return snapshot && snapshot.key === key ? snapshot.state : EMPTY;
}
