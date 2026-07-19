"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtClock, fmtPrice, fmtQty } from "@/lib/format";
import { useProvider } from "@/lib/providers";
import type { Tick } from "@/lib/types";
import { useSettings } from "@/stores/settings";
import { VirtualList } from "@/components/ui/VirtualList";

const MAX_ROWS = 500;
const ROW_HEIGHT = 18;

interface TapeRow extends Tick {
  id: number;
  block: boolean;
}

/**
 * Time & sales tape: ticks buffer into a ref and flush to state once per
 * animation frame; rows are virtualized. Block trades (>=8x rolling average
 * size) get highlighted.
 */
export function TimeAndSales() {
  const provider = useProvider();
  const symbol = useSettings((s) => s.symbol);
  const [rows, setRows] = useState<TapeRow[]>([]);
  const buffer = useRef<TapeRow[]>([]);
  const rafId = useRef(0);
  const idCounter = useRef(0);
  const avgSize = useRef(0);

  useEffect(() => {
    setRows([]);
    buffer.current = [];
    avgSize.current = 0;
    const unsub = provider.subscribeTicks(symbol, (t) => {
      avgSize.current = avgSize.current === 0 ? t.qty : avgSize.current * 0.98 + t.qty * 0.02;
      buffer.current.push({
        ...t,
        id: idCounter.current++,
        block: avgSize.current > 0 && t.qty >= avgSize.current * 8,
      });
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = 0;
          const incoming = buffer.current;
          buffer.current = [];
          setRows((prev) => {
            const next = [...incoming.reverse(), ...prev];
            return next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next;
          });
        });
      }
    });
    return () => {
      unsub();
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    };
  }, [provider, symbol]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 border-b border-edge px-2 py-1 text-2xs text-low">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-2xs text-low">
          Waiting for trades…
        </div>
      ) : (
        <VirtualList
          items={rows}
          rowHeight={ROW_HEIGHT}
          className="min-h-0 flex-1"
          renderRow={(t) => (
            <div
              key={t.id}
              style={{ height: ROW_HEIGHT }}
              className={cn(
                "grid grid-cols-3 items-center gap-1 px-2",
                t.block && (t.isSellerMaker ? "bg-down-muted" : "bg-up-muted"),
              )}
            >
              <span className="num text-2xs text-low">{fmtClock(t.time)}</span>
              <span
                className={cn(
                  "num text-right text-2xs",
                  t.isSellerMaker ? "text-down" : "text-up",
                )}
              >
                {fmtPrice(t.price)}
              </span>
              <span
                className={cn("num text-right text-2xs", t.block ? "font-semibold text-hi" : "text-mid")}
              >
                {fmtQty(t.qty)}
              </span>
            </div>
          )}
        />
      )}
    </div>
  );
}
