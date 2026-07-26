"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtPrice, fmtQty } from "@/lib/terminal-app/lib/format";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import type { OrderBook as Book } from "@/lib/terminal-app/lib/types";
import { useLayout } from "@/lib/terminal-app/stores/layout";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { useTrading } from "@/lib/terminal-app/stores/trading";

export const SET_ORDER_PRICE_EVENT = "tt:set-order-price";

export interface OrderPrefill {
  price: number;
  side: "buy" | "sell";
}

const DEPTH = 20;

/**
 * Bid/ask ladder. Book updates land in a ref and are flushed to state at most
 * once per animation frame, so a 100ms-interval stream never outpaces paint.
 */
export function OrderBook() {
  const provider = useProvider();
  const symbol = useSettings((s) => s.symbol);
  const [book, setBook] = useState<Book | null>(null);
  const pending = useRef<Book | null>(null);
  const rafId = useRef(0);

  useEffect(() => {
    setBook(null);
    const unsub = provider.subscribeOrderBook(symbol, DEPTH, (b) => {
      pending.current = b;
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = 0;
          if (pending.current) setBook(pending.current);
        });
      }
    });
    return () => {
      unsub();
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    };
  }, [provider, symbol]);

  if (!book) {
    return <BookSkeleton />;
  }

  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  const spread = bestAsk - bestBid;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  // Running depth totals — accumulated explicitly rather than by mutating a
  // captured variable inside .map(), which reads as a pure transform but isn't.
  const withCum = (levels: typeof book.asks) => {
    const out: ((typeof levels)[number] & { cum: number })[] = [];
    let total = 0;
    for (const l of levels) {
      total += l.qty;
      out.push({ ...l, cum: total });
    }
    return { rows: out, max: total };
  };
  const { rows: asksCum, max: askMax } = withCum(book.asks);
  const { rows: bidsCum, max: bidMax } = withCum(book.bids);

  /**
   * Click-to-trade at a level: clicking a bid preps a buy, an ask preps a
   * sell. Plain click pre-fills the ticket; Alt+click places the limit order
   * immediately at the shared default quantity.
   */
  const levelClick = (price: number, side: "buy" | "sell", instant: boolean) => {
    if (instant) {
      const { defaultQty, placeOrder } = useTrading.getState();
      placeOrder({ symbol, side, type: "limit", qty: defaultQty, price });
      return;
    }
    const detail: OrderPrefill = { price, side };
    window.dispatchEvent(new CustomEvent(SET_ORDER_PRICE_EVENT, { detail }));
    useLayout.getState().setRightTab("order");
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="grid grid-cols-3 gap-1 border-b border-edge px-2 py-1 text-2xs text-low">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      <div className="flex flex-1 flex-col justify-end">
        {[...asksCum].reverse().map((l) => (
          <Row
            key={l.price}
            price={l.price}
            qty={l.qty}
            cum={l.cum}
            max={askMax}
            side="ask"
            onClick={(instant) => levelClick(l.price, "sell", instant)}
          />
        ))}
      </div>
      <div className="num flex items-center justify-between border-y border-edge bg-elevated px-2 py-1 text-2xs">
        <span className="text-hi">{fmtPrice(spread)}</span>
        <span className="text-low">spread</span>
        <span className="text-mid">{spreadPct.toFixed(3)}%</span>
      </div>
      <div className="flex flex-1 flex-col">
        {bidsCum.map((l) => (
          <Row
            key={l.price}
            price={l.price}
            qty={l.qty}
            cum={l.cum}
            max={bidMax}
            side="bid"
            onClick={(instant) => levelClick(l.price, "buy", instant)}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  price,
  qty,
  cum,
  max,
  side,
  onClick,
}: {
  price: number;
  qty: number;
  cum: number;
  max: number;
  side: "bid" | "ask";
  onClick: (instant: boolean) => void;
}) {
  const depth = max > 0 ? Math.min(100, (cum / max) * 100) : 0;
  return (
    <button
      type="button"
      title={`Click: prep ${side === "bid" ? "buy" : "sell"} limit · Alt+click: place instantly`}
      className="relative grid w-full grid-cols-3 gap-1 px-2 py-px text-left transition-colors duration-100 hover:bg-hover"
      onClick={(e) => onClick(e.altKey)}
    >
      <span
        className="absolute inset-y-0 right-0"
        style={{
          width: `${depth}%`,
          background: side === "bid" ? "var(--tk-up-muted)" : "var(--tk-down-muted)",
        }}
      />
      <span className={cn("num relative z-10 text-2xs", side === "bid" ? "text-up" : "text-down")}>
        {fmtPrice(price)}
      </span>
      <span className="num relative z-10 text-right text-2xs text-hi">{fmtQty(qty)}</span>
      <span className="num relative z-10 text-right text-2xs text-mid">{fmtQty(cum)}</span>
    </button>
  );
}

function BookSkeleton() {
  return (
    <div className="flex h-full flex-col gap-1 p-2">
      {Array.from({ length: 24 }, (_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded-sm bg-hover"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}
