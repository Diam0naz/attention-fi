"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartType, PriceScaleMode, Timeframe } from "@/lib/types";

export type Theme = "dark" | "light";
export type ProviderKind = "binance" | "mock";
export type GridLayout = "1" | "2h" | "2v" | "4";

interface SettingsState {
  theme: Theme;
  provider: ProviderKind;
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  priceScale: PriceScaleMode;
  gridLayout: GridLayout;
  /** secondary symbols for multi-chart grids, index 0 = pane 2, etc. */
  gridSymbols: string[];
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
  setGridSymbol: (index: number, symbol: string) => void;
  setSyncCrosshair: (v: boolean) => void;
  toggleCrosshairLock: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      chartType: "candles",
      priceScale: "linear",
      gridLayout: "1",
      gridSymbols: ["ETHUSDT", "SOLUSDT", "BNBUSDT"],
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
      setProvider: (provider) => set({ provider }),
      setSymbol: (symbol) => set({ symbol: symbol.toUpperCase() }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setChartType: (chartType) => set({ chartType }),
      setPriceScale: (priceScale) => set({ priceScale }),
      setGridLayout: (gridLayout) => set({ gridLayout }),
      setGridSymbol: (index, symbol) =>
        set((s) => {
          const gridSymbols = [...s.gridSymbols];
          gridSymbols[index] = symbol.toUpperCase();
          return { gridSymbols };
        }),
      setSyncCrosshair: (syncCrosshair) => set({ syncCrosshair }),
      toggleCrosshairLock: () =>
        set((s) => ({ crosshairLocked: !s.crosshairLocked })),
    }),
    {
      name: "tt.settings",
      partialize: (s) => ({
        theme: s.theme,
        provider: s.provider,
        symbol: s.symbol,
        timeframe: s.timeframe,
        chartType: s.chartType,
        priceScale: s.priceScale,
        gridLayout: s.gridLayout,
        gridSymbols: s.gridSymbols,
        syncCrosshair: s.syncCrosshair,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.theme);
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
