"use client";

import { useEffect, useState } from "react";

// Live SOL/USD rate for USD display labels. The program is lamports/SOL-native,
// so this never touches on-chain logic — it only scales SOL amounts to USD in
// the UI. Held as module state so non-reactive lib code (token-data,
// token-index, price-chart conversions) can read the current rate synchronously
// via solUsd(), while components stay reactive via useSolUsd().

let rate = 164.2;

/** Current SOL/USD (last fetched value, or the static default). */
export function solUsd(): number {
  return rate;
}

/** Refresh the rate from /api/sol-price; keeps the last good value on failure. */
export async function refreshSolUsd(): Promise<number> {
  try {
    const res = await fetch("/api/sol-price");
    if (res.ok) {
      const json = (await res.json()) as { usd?: number };
      if (typeof json.usd === "number" && json.usd > 0) rate = json.usd;
    }
  } catch {
    // keep last known rate
  }
  return rate;
}

/** Reactive SOL/USD for components. Refreshes on mount and every 5 min. */
export function useSolUsd(): number {
  const [value, setValue] = useState(rate);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void refreshSolUsd().then((r) => {
        if (!cancelled) setValue(r);
      });
    };
    tick();
    const id = setInterval(tick, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return value;
}
