"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { getConnection } from "@/lib/solana/program";
import { fetchAllCurves, fetchGlobal, quoteSell, spotPriceSol } from "@/lib/solana/curve";
import { fetchAllPools, poolSpotSol, swapQuote } from "@/lib/solana/amm";
import { solUsd } from "@/lib/solana/sol-usd";

/** SPL Token program — where the wallet's token accounts live. */
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

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
  /** True once the curve has graduated — pricing then lives in the AMM. */
  graduated: boolean;
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
 * the live curves.
 *
 * Replaces a mock that generated holdings deterministically from the wallet
 * address — stable across reloads and plausible-looking, which is the worst
 * way to be wrong.
 *
 * One RPC call covers every balance: `getParsedTokenAccountsByOwner` over the
 * whole token program returns all of them, so this doesn't scale with the
 * number of tokens on the platform. Curves are read in a single
 * `bondingCurve.all()` for the same reason.
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
        const connection = getConnection();
        const owner = new PublicKey(address);

        const [accounts, curves, pools, global, tokensRes] = await Promise.all([
          connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
          fetchAllCurves(readonly),
          fetchAllPools(readonly),
          fetchGlobal(readonly).catch(() => null),
          fetch("/api/tokens").then((r) => (r.ok ? r.json() : { tokens: [] })),
        ]);
        if (cancelled) return;

        const decimals = global?.tokenDecimals ?? 6;
        const usdRate = solUsd();

        // mint -> whole tokens held, summed across accounts for the same mint.
        const balances = new Map<string, number>();
        for (const acc of accounts.value) {
          const info = acc.account.data.parsed.info;
          const ui = info.tokenAmount?.uiAmount ?? 0;
          if (ui > 0) balances.set(info.mint, (balances.get(info.mint) ?? 0) + ui);
        }

        const meta = new Map<string, { handle: string; symbol: string; name: string }>();
        for (const t of (tokensRes as { tokens?: { handle: string; mint: string; symbol?: string; name?: string }[] }).tokens ?? []) {
          if (!t?.mint) continue;
          meta.set(t.mint, {
            handle: t.handle,
            symbol: t.symbol || t.handle.slice(0, 4).toUpperCase(),
            name: t.name || t.handle,
          });
        }

        const byMint = new Map(curves.map((c) => [c.mint, c]));
        const poolByMint = new Map(pools.map((p) => [p.mint, p]));
        const feeBps = global?.feeBps ?? 100;
        const holdings: Holding[] = [];
        for (const [mint, amount] of balances) {
          const curve = byMint.get(mint);
          // No curve means it isn't an AttentionFi token — a wallet holds all
          // sorts of things, and listing them here would be inventing coverage
          // this app doesn't have.
          if (!curve) continue;
          const info = meta.get(mint);
          const pool = poolByMint.get(mint);
          const base = BigInt(Math.floor(amount * 10 ** decimals));

          // Which venue prices this depends on whether it graduated. After
          // graduation the curve's *real* reserves are zero — every lamport
          // moved into the pool — so its spot is a leftover of the virtual
          // reserves and describes a market that no longer exists. Pricing a
          // graduated position off the curve reports a number nobody can trade
          // at, which is precisely the mistake that stranded one already.
          let spot: number;
          let realisable: number;
          if (pool) {
            spot = poolSpotSol(pool, decimals);
            realisable =
              Number(swapQuote(pool.tokenReserves, pool.solReserves, base, feeBps)) / 1e9;
          } else {
            spot = spotPriceSol(curve, decimals);
            realisable = quoteSell(curve, amount * 10 ** decimals);
          }
          const naive = spot * amount;

          holdings.push({
            handle: info?.handle ?? mint.slice(0, 6),
            symbol: info?.symbol ?? mint.slice(0, 4).toUpperCase(),
            name: info?.name ?? mint,
            mint,
            amount,
            valueSol: realisable,
            valueUsd: realisable * usdRate,
            spotSol: spot,
            slippage: naive > 0 ? Math.max(0, (naive - realisable) / naive) : 0,
            // A pool is the definitive signal: `complete` is set at the moment
            // the threshold is crossed, but the token isn't actually trading
            // anywhere until the pool exists.
            graduated: Boolean(pool),
          });
        }

        holdings.sort((a, b) => b.valueUsd - a.valueUsd);
        const totalUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

        const claimableLamports = curves
          .filter((c) => c.creator === address)
          .reduce((sum, c) => sum + c.creatorFees, 0n);
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
