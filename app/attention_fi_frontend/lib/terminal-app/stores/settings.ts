"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartType, PriceScaleMode, Timeframe } from "@/lib/terminal-app/lib/types";

export type Theme = "dark" | "light";
export type ProviderKind = "attentionfi" | "binance" | "mock";
export type GridLayout = "1" | "2h" | "2v" | "4";

/** sensible active symbol when switching data source */
export const PROVIDER_DEFAULT_SYMBOL: Record<ProviderKind, string> = {
  attentionfi: "solana_kol",
  binance: "BTCUSDT",
  mock: "BTCUSDT",
};

/** How many chart panes each layout shows. */
export const PANE_COUNT: Record<GridLayout, number> = { "1": 1, "2h": 2, "2v": 2, "4": 4 };

const MAX_PANES = 4;

/**
 * A symbol in the shape its provider expects.
 *
 * AttentionFi markets are X handles, which are lowercase and may be typed with
 * a leading `@`; exchange tickers are uppercase. Getting this wrong doesn't
 * error — it produces a symbol that looks right and resolves to nothing, which
 * is how a freshly-added token could sit in the watchlist with no price beside
 * it forever. One function so the three places that accept a symbol (search,
 * watchlist, pane assignment) cannot disagree about it.
 */
export function normalizeSymbol(provider: ProviderKind, symbol: string): string {
  const s = symbol.trim();
  return provider === "attentionfi" ? s.replace(/^@/, "").toLowerCase() : s.toUpperCase();
}

interface SettingsState {
  theme: Theme;
  provider: ProviderKind;
  /** The focused pane's symbol — mirrors `paneSymbols[activePane]`. */
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  priceScale: PriceScaleMode;
  gridLayout: GridLayout;
  /** What each pane charts, indexed by pane. */
  paneSymbols: string[];
  /** Which pane the search box, order ticket, book and tape act on. */
  activePane: number;
  syncCrosshair: boolean;
  crosshairLocked: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setProvider: (p: ProviderKind) => void;
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setChartType: (c: ChartType) => void;
  setPriceScale: (m: PriceScaleMode) => void;
  setGridLayout: (g: GridLayout) => void;
  setActivePane: (index: number) => void;
  setSyncCrosshair: (v: boolean) => void;
  toggleCrosshairLock: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      provider: "attentionfi",
      symbol: "solana_kol",
      timeframe: "1h",
      chartType: "candles",
      priceScale: "linear",
      gridLayout: "1",
      paneSymbols: Array.from({ length: MAX_PANES }, () => "solana_kol"),
      activePane: 0,
      syncCrosshair: false,
      crosshairLocked: false,
      setTheme: (theme) => {
        set({ theme });
        applyThemeClass(theme);
      },
      toggleTheme: () =>
        set((s) => {
          const theme: Theme = s.theme === "dark" ? "light" : "dark";
          applyThemeClass(theme);
          return { theme };
        }),
      // Symbols don't carry across sources — a handle means nothing to Binance
      // — so every pane resets to the new source's default rather than keeping
      // an address the new provider will silently fail to resolve.
      setProvider: (provider) => {
        const symbol = PROVIDER_DEFAULT_SYMBOL[provider];
        set({
          provider,
          symbol,
          activePane: 0,
          paneSymbols: Array.from({ length: MAX_PANES }, () => symbol),
        });
      },
      // Writes to the focused pane, which is what makes a grid usable: pick a
      // pane, search, and that pane changes. `symbol` is kept in step because
      // the rest of the terminal — ticket, book, tape, alerts — reads it as
      // "the market I am looking at".
      setSymbol: (input) =>
        set((s) => {
          const symbol = normalizeSymbol(s.provider, input);
          const paneSymbols = [...s.paneSymbols];
          paneSymbols[s.activePane] = symbol;
          return { symbol, paneSymbols };
        }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setChartType: (chartType) => set({ chartType }),
      setPriceScale: (priceScale) => set({ priceScale }),
      // Shrinking the grid can orphan the focus — going from 4 panes back to 1
      // while pane 3 is active would leave every panel driven by a chart that
      // is no longer on screen.
      setGridLayout: (gridLayout) =>
        set((s) => {
          const activePane = Math.min(s.activePane, PANE_COUNT[gridLayout] - 1);
          return { gridLayout, activePane, symbol: s.paneSymbols[activePane] ?? s.symbol };
        }),
      setActivePane: (index) =>
        set((s) => {
          if (index === s.activePane || index < 0 || index >= PANE_COUNT[s.gridLayout]) return s;
          return { activePane: index, symbol: s.paneSymbols[index] ?? s.symbol };
        }),
      setSyncCrosshair: (syncCrosshair) => set({ syncCrosshair }),
      toggleCrosshairLock: () =>
        set((s) => ({ crosshairLocked: !s.crosshairLocked })),
    }),
    {
      name: "tt.settings",
      version: 1,
      partialize: (s) => ({
        theme: s.theme,
        provider: s.provider,
        symbol: s.symbol,
        timeframe: s.timeframe,
        chartType: s.chartType,
        priceScale: s.priceScale,
        gridLayout: s.gridLayout,
        paneSymbols: s.paneSymbols,
        activePane: s.activePane,
        syncCrosshair: s.syncCrosshair,
      }),
      /**
       * v0 stored `gridSymbols` — secondary panes only, always uppercased, and
       * seeded with exchange tickers. On the default AttentionFi source those
       * seeds resolve to nothing, so a split view opened onto a permanently
       * blank second chart. Anyone charting an exchange keeps their panes;
       * where the seeds can't be right, every pane starts on the active symbol
       * and the reader picks from there.
       */
      migrate: (persisted, version) => {
        const s = persisted as Partial<SettingsState> & { gridSymbols?: string[] };
        if (version >= 1) return s as SettingsState;
        const symbol = s.symbol ?? PROVIDER_DEFAULT_SYMBOL[s.provider ?? "attentionfi"];
        const keep = s.provider !== "attentionfi" ? (s.gridSymbols ?? []) : [];
        return {
          ...s,
          activePane: 0,
          paneSymbols: Array.from({ length: MAX_PANES }, (_, i) =>
            i === 0 ? symbol : (keep[i - 1] ?? symbol),
          ),
        } as SettingsState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyThemeClass(state.theme);
        // `setGridLayout` clamps the focus when the grid shrinks, but nothing
        // clamps it on load. A stored pane 4 under a restored single-pane
        // layout would leave the ticket trading a chart that isn't rendered.
        const last = PANE_COUNT[state.gridLayout] - 1;
        if (state.activePane > last) {
          state.activePane = last;
          state.symbol = state.paneSymbols[last] ?? state.symbol;
        }
      },
    },
  ),
);

function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
  try {
    localStorage.setItem("tt.theme", theme);
  } catch {
    /* storage unavailable */
  }
}
