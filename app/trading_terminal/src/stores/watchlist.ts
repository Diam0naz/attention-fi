"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WatchlistSortKey = "symbol" | "last" | "change" | "changePercent";

interface WatchlistState {
  lists: Record<string, string[]>;
  activeList: string;
  sortKey: WatchlistSortKey | null;
  sortDir: "asc" | "desc";
  setActiveList: (name: string) => void;
  createList: (name: string) => void;
  deleteList: (name: string) => void;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  reorder: (from: number, to: number) => void;
  setSort: (key: WatchlistSortKey | null) => void;
}

const DEFAULT_LISTS: Record<string, string[]> = {
  Majors: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"],
  DeFi: ["UNIUSDT", "AAVEUSDT", "LINKUSDT", "MKRUSDT"],
};

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set) => ({
      lists: DEFAULT_LISTS,
      activeList: "Majors",
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
      addSymbol: (symbol) =>
        set((s) => {
          const list = s.lists[s.activeList] ?? [];
          const sym = symbol.toUpperCase();
          if (list.includes(sym)) return s;
          return { lists: { ...s.lists, [s.activeList]: [...list, sym] } };
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
