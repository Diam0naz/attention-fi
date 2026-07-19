"use client";

import type { MarketDataProvider } from "@/lib/types";
import { useSettings, type ProviderKind } from "@/stores/settings";
import { BinanceProvider } from "./binance";
import { MockProvider } from "./mock";

const instances: Partial<Record<ProviderKind, MarketDataProvider>> = {};

export function getProvider(kind: ProviderKind): MarketDataProvider {
  let p = instances[kind];
  if (!p) {
    p = kind === "binance" ? new BinanceProvider() : new MockProvider();
    instances[kind] = p;
  }
  return p;
}

export function useProvider(): MarketDataProvider {
  const kind = useSettings((s) => s.provider);
  return getProvider(kind);
}
