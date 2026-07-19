"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  direction: "above" | "below";
  createdAt: number;
  triggeredAt: number | null;
}

interface AlertsState {
  alerts: PriceAlert[];
  /** most recent trigger, consumed by the toast layer */
  lastTriggered: PriceAlert | null;
  addAlert: (symbol: string, price: number, direction: "above" | "below") => void;
  removeAlert: (id: string) => void;
  onMark: (symbol: string, price: number) => void;
  ackTriggered: () => void;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `al-${Date.now().toString(36)}-${counter}`;
}

export const useAlerts = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],
      lastTriggered: null,
      addAlert: (symbol, price, direction) =>
        set((s) => ({
          alerts: [
            {
              id: nextId(),
              symbol: symbol.toUpperCase(),
              price,
              direction,
              createdAt: Date.now(),
              triggeredAt: null,
            },
            ...s.alerts,
          ],
        })),
      removeAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      onMark: (symbol, price) => {
        const pending = get().alerts.filter(
          (a) =>
            a.symbol === symbol &&
            a.triggeredAt === null &&
            ((a.direction === "above" && price >= a.price) ||
              (a.direction === "below" && price <= a.price)),
        );
        if (pending.length === 0) return;
        const now = Date.now();
        set((s) => ({
          alerts: s.alerts.map((a) =>
            pending.some((p) => p.id === a.id) ? { ...a, triggeredAt: now } : a,
          ),
          lastTriggered: { ...pending[0]!, triggeredAt: now },
        }));
      },
      ackTriggered: () => set({ lastTriggered: null }),
    }),
    { name: "tt.alerts", partialize: (s) => ({ alerts: s.alerts }) },
  ),
);
