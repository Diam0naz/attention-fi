"use client";

import { useEffect, useMemo } from "react";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import { useAlerts } from "@/lib/terminal-app/stores/alerts";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { useTrading } from "@/lib/terminal-app/stores/trading";

/**
 * Keeps mark prices flowing into the trading and alert stores for every
 * symbol that needs one: the active chart symbol, symbols with open limit
 * orders, and symbols with pending alerts. Stream count is capped to stay
 * polite to the upstream socket.
 */
const MAX_STREAMS = 12;

export function useMarketFeeds() {
  const provider = useProvider();
  const symbol = useSettings((s) => s.symbol);
  const orders = useTrading((s) => s.orders);
  const alerts = useAlerts((s) => s.alerts);

  const symbols = useMemo(() => {
    const set = new Set<string>([symbol]);
    for (const o of orders) {
      if (o.status === "open") set.add(o.symbol);
    }
    for (const a of alerts) {
      if (a.triggeredAt === null) set.add(a.symbol);
    }
    return [...set].slice(0, MAX_STREAMS);
  }, [symbol, orders, alerts]);

  useEffect(() => {
    const unsubs = symbols.map((sym) =>
      provider.subscribeTicks(sym, (t) => {
        useTrading.getState().onMark(t.symbol, t.price);
        useAlerts.getState().onMark(t.symbol, t.price);
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [provider, symbols]);
}
