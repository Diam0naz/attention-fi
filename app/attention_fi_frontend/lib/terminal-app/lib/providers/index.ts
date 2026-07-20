"use client";

import type { MarketDataProvider } from "@/lib/terminal-app/lib/types";
import { useSettings, type ProviderKind } from "@/lib/terminal-app/stores/settings";
import { AttentionFiProvider } from "./attentionfi";
import { BinanceProvider } from "./binance";
import { MockProvider } from "./mock";

const instances: Partial<Record<ProviderKind, MarketDataProvider>> = {};

export function getProvider(kind: ProviderKind): MarketDataProvider {
  let p = instances[kind];
  if (!p) {
    p =
      kind === "attentionfi"
        ? new AttentionFiProvider()
        : kind === "binance"
          ? new BinanceProvider()
          : new MockProvider();
    instances[kind] = p;
  }
  return p;
}

export function useProvider(): MarketDataProvider {
  const kind = useSettings((s) => s.provider);
  return getProvider(kind);
}
