"use client";

import { useEffect, useState } from "react";
import { launchedMeta, syncRegistry } from "@/lib/solana/registry";
import { useSettings, type ProviderKind } from "@/lib/terminal-app/stores/settings";

/**
 * What to call an AttentionFi market on screen.
 *
 * A market has two names and they are not interchangeable. `king_diamonaz` is
 * the *subject* — whose attention is being traded, and the key everything
 * on-chain and in the registry is filed under. `GOJO` is what the creator named
 * the token, and it's what a holder sees in their wallet and on an explorer.
 *
 * The terminal used the handle everywhere, so a balance pill read
 * "696.15M KING_DIAMONAZ" for a token actually called GOJO — a quantity of
 * something the trader owns none of, under a ticker that doesn't exist. Both
 * names are worth showing; the ticker leads, because that's the thing being
 * counted.
 */
export interface TokenLabel {
  /** The token's ticker — "GOJO". Falls back to the handle when unregistered. */
  ticker: string;
  /** The subject — "@king_diamonaz". Null on exchange data sources. */
  handle: string | null;
}

export function tokenLabel(provider: ProviderKind, symbol: string): TokenLabel {
  if (provider !== "attentionfi") return { ticker: symbol, handle: null };
  const ticker = launchedMeta(symbol)?.symbol?.trim();
  return { ticker: ticker || symbol.toUpperCase(), handle: `@${symbol}` };
}

/**
 * The active market's label, or a given symbol's.
 *
 * `launchedMeta` reads a registry cache that starts empty on a cold load, so a
 * token launched from another browser would first render under its handle and
 * never correct itself. Syncing here and re-rendering on completion is what
 * makes the ticker appear for tokens this browser didn't launch.
 */
export function useTokenLabel(symbolOverride?: string): TokenLabel {
  const provider = useSettings((s) => s.provider);
  const active = useSettings((s) => s.symbol);
  const symbol = symbolOverride ?? active;
  const [, bump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void syncRegistry().then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return tokenLabel(provider, symbol);
}
