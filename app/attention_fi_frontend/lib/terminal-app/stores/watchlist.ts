"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeSymbol, useSettings } from "@/lib/terminal-app/stores/settings";

export type WatchlistSortKey = "symbol" | "last" | "change" | "changePercent";

/**
 * The built-in list that mirrors every launched token rather than a fixed set.
 *
 * A hand-written list can't contain a token that didn't exist when it was
 * written, which is why a fresh launch never appeared here and the one seeded
 * handle did.
 */
export const ATTENTIONFI_LIST = "AttentionFi";

interface WatchlistState {
  lists: Record<string, string[]>;
  activeList: string;
  /** Auto-discovered handles the reader took off the AttentionFi list. */
  dismissed: string[];
  sortKey: WatchlistSortKey | null;
  sortDir: "asc" | "desc";
  setActiveList: (name: string) => void;
  createList: (name: string) => void;
  deleteList: (name: string) => void;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  dismiss: (symbol: string) => void;
  reorder: (from: number, to: number) => void;
  setSort: (key: WatchlistSortKey | null) => void;
}

const DEFAULT_LISTS: Record<string, string[]> = {
  [ATTENTIONFI_LIST]: [],
  Majors: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"],
};

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set) => ({
      lists: DEFAULT_LISTS,
      activeList: ATTENTIONFI_LIST,
      dismissed: [],
      sortKey: null,
      sortDir: "desc",
      setActiveList: (activeList) => set({ activeList }),
      createList: (name) =>
        set((s) => {
          if (!name.trim() || s.lists[name]) return s;
          return { lists: { ...s.lists, [name]: [] }, activeList: name };
        }),
      deleteList: (name) =>
        set((s) => {
          const names = Object.keys(s.lists);
          if (names.length <= 1) return s;
          const lists = { ...s.lists };
          delete lists[name];
          const remaining = Object.keys(lists);
          const activeList =
            s.activeList === name ? (remaining[0] ?? "") : s.activeList;
          return { lists, activeList };
        }),
      // Normalized for the live data source rather than blanket-uppercased.
      // AttentionFi markets are lowercase handles, so `KING_DIAMONAZ` was
      // stored, never matched the lowercase key its price arrives under, and
      // the row sat there showing a dash — present, but dead.
      addSymbol: (symbol) =>
        set((s) => {
          const list = s.lists[s.activeList] ?? [];
          const sym = normalizeSymbol(useSettings.getState().provider, symbol);
          if (!sym) return s;
          const dismissed = s.dismissed.filter((x) => x !== sym);
          if (list.includes(sym)) return { dismissed };
          return { lists: { ...s.lists, [s.activeList]: [...list, sym] }, dismissed };
        }),
      removeSymbol: (symbol) =>
        set((s) => {
          const list = s.lists[s.activeList] ?? [];
          return {
            lists: {
              ...s.lists,
              [s.activeList]: list.filter((x) => x !== symbol),
            },
          };
        }),
      // Auto-discovered rows aren't in `lists`, so filtering can't remove them
      // — they'd reappear on the next registry sync. Remembering the refusal is
      // the only thing that makes it stick.
      dismiss: (symbol) =>
        set((s) => (s.dismissed.includes(symbol) ? s : { dismissed: [...s.dismissed, symbol] })),
      reorder: (from, to) =>
        set((s) => {
          const list = [...(s.lists[s.activeList] ?? [])];
          const item = list[from];
          if (item === undefined || to < 0 || to >= list.length) return s;
          list.splice(from, 1);
          list.splice(to, 0, item);
          return { lists: { ...s.lists, [s.activeList]: list } };
        }),
      setSort: (key) =>
        set((s) => {
          if (s.sortKey === key) {
            if (s.sortDir === "desc") return { sortDir: "asc" };
            return { sortKey: null, sortDir: "desc" };
          }
          return { sortKey: key, sortDir: "desc" };
        }),
    }),
    { name: "tt.watchlist" },
  ),
);
