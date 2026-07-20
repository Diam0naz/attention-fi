"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Side } from "@/lib/terminal-app/lib/types";

export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "filled" | "canceled";

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  /** limit price; for market orders the fill price */
  price: number;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
  fillPrice?: number;
}

export interface Position {
  symbol: string;
  /** signed: positive long, negative short */
  qty: number;
  avgPrice: number;
  realizedPnl: number;
}

export interface LogEntry {
  id: string;
  time: number;
  kind: "order" | "fill" | "cancel" | "alert";
  message: string;
}

interface TradingState {
  orders: Order[];
  positions: Record<string, Position>;
  log: LogEntry[];
  /** last known mark price per symbol, fed by tick subscriptions */
  marks: Record<string, number>;
  /** shared default size for hotkey trades and DOM Alt+click */
  defaultQty: number;
  setDefaultQty: (qty: number) => void;
  placeOrder: (o: {
    symbol: string;
    side: Side;
    type: OrderType;
    qty: number;
    price: number;
  }) => void;
  cancelOrder: (id: string) => void;
  /** cancel every working order, optionally scoped to one symbol */
  cancelAll: (symbol?: string) => void;
  onMark: (symbol: string, price: number) => void;
  closePosition: (symbol: string) => void;
  appendLog: (kind: LogEntry["kind"], message: string) => void;
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function applyFill(
  positions: Record<string, Position>,
  symbol: string,
  side: Side,
  qty: number,
  price: number,
): Record<string, Position> {
  const prev = positions[symbol] ?? { symbol, qty: 0, avgPrice: 0, realizedPnl: 0 };
  const signed = side === "buy" ? qty : -qty;
  let { qty: posQty, avgPrice, realizedPnl } = prev;

  if (posQty === 0 || Math.sign(posQty) === Math.sign(signed)) {
    // opening or adding: weighted average entry
    const total = posQty + signed;
    avgPrice = total === 0 ? 0 : (avgPrice * Math.abs(posQty) + price * qty) / Math.abs(total);
    posQty = total;
  } else {
    // reducing / flipping: realize pnl on the closed portion
    const closing = Math.min(Math.abs(signed), Math.abs(posQty));
    const direction = Math.sign(posQty); // +1 long, -1 short
    realizedPnl += (price - avgPrice) * closing * direction;
    posQty += signed;
    if (posQty !== 0 && Math.sign(posQty) === Math.sign(signed)) {
      // flipped through zero; remainder opens at fill price
      avgPrice = price;
    } else if (posQty === 0) {
      avgPrice = 0;
    }
  }

  return { ...positions, [symbol]: { symbol, qty: posQty, avgPrice, realizedPnl } };
}

export const useTrading = create<TradingState>()(
  persist(
    (set, get) => ({
      orders: [],
      positions: {},
      log: [],
      marks: {},
      defaultQty: 1,
      setDefaultQty: (defaultQty) => {
        if (defaultQty > 0) set({ defaultQty });
      },
      appendLog: (kind, message) =>
        set((s) => ({
          log: [
            { id: nextId("log"), time: Date.now(), kind, message },
            ...s.log.slice(0, 499),
          ],
        })),
      placeOrder: ({ symbol, side, type, qty, price }) => {
        if (qty <= 0 || price <= 0) return;
        const id = nextId("ord");
        if (type === "market") {
          const mark = get().marks[symbol] ?? price;
          const order: Order = {
            id,
            symbol,
            side,
            type,
            qty,
            price: mark,
            status: "filled",
            createdAt: Date.now(),
            filledAt: Date.now(),
            fillPrice: mark,
          };
          set((s) => ({
            orders: [order, ...s.orders],
            positions: applyFill(s.positions, symbol, side, qty, mark),
          }));
          get().appendLog(
            "fill",
            `${side.toUpperCase()} ${qty} ${symbol} @ market (${mark})`,
          );
        } else {
          const order: Order = {
            id,
            symbol,
            side,
            type,
            qty,
            price,
            status: "open",
            createdAt: Date.now(),
          };
          set((s) => ({ orders: [order, ...s.orders] }));
          get().appendLog(
            "order",
            `LIMIT ${side.toUpperCase()} ${qty} ${symbol} @ ${price}`,
          );
        }
      },
      cancelOrder: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order || order.status !== "open") return;
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, status: "canceled" as const } : o,
          ),
        }));
        get().appendLog("cancel", `Canceled ${order.side} ${order.qty} ${order.symbol}`);
      },
      cancelAll: (symbol) => {
        const targets = get().orders.filter(
          (o) => o.status === "open" && (symbol === undefined || o.symbol === symbol),
        );
        if (targets.length === 0) return;
        set((s) => ({
          orders: s.orders.map((o) =>
            targets.some((t) => t.id === o.id) ? { ...o, status: "canceled" as const } : o,
          ),
        }));
        get().appendLog(
          "cancel",
          `Canceled ${targets.length} working order${targets.length > 1 ? "s" : ""}${symbol ? ` on ${symbol}` : ""}`,
        );
      },
      onMark: (symbol, price) => {
        const s = get();
        if (s.marks[symbol] === price) return;
        // fill any crossed open limit orders
        const crossed = s.orders.filter(
          (o) =>
            o.status === "open" &&
            o.symbol === symbol &&
            ((o.side === "buy" && price <= o.price) ||
              (o.side === "sell" && price >= o.price)),
        );
        if (crossed.length === 0) {
          set({ marks: { ...s.marks, [symbol]: price } });
          return;
        }
        set((state) => {
          let positions = state.positions;
          for (const o of crossed) {
            positions = applyFill(positions, symbol, o.side, o.qty, o.price);
          }
          return {
            marks: { ...state.marks, [symbol]: price },
            positions,
            orders: state.orders.map((o) =>
              crossed.some((c) => c.id === o.id)
                ? { ...o, status: "filled" as const, filledAt: Date.now(), fillPrice: o.price }
                : o,
            ),
          };
        });
        for (const o of crossed) {
          get().appendLog(
            "fill",
            `LIMIT ${o.side.toUpperCase()} ${o.qty} ${o.symbol} filled @ ${o.price}`,
          );
        }
      },
      closePosition: (symbol) => {
        const s = get();
        const pos = s.positions[symbol];
        const mark = s.marks[symbol];
        if (!pos || pos.qty === 0 || mark === undefined) return;
        const side: Side = pos.qty > 0 ? "sell" : "buy";
        get().placeOrder({ symbol, side, type: "market", qty: Math.abs(pos.qty), price: mark });
      },
    }),
    {
      name: "tt.trading",
      partialize: (s) => ({
        orders: s.orders,
        positions: s.positions,
        log: s.log,
        defaultQty: s.defaultQty,
      }),
    },
  ),
);
