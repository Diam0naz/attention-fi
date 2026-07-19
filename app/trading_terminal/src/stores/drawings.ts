"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DrawingTool =
  | "trendline"
  | "ray"
  | "hline"
  | "vline"
  | "rect"
  | "fib-retracement"
  | "fib-extension"
  | "text"
  | "measure";

export interface DrawingPoint {
  time: number; // unix seconds
  price: number;
}

export type DashStyle = "solid" | "dashed" | "dotted";

export interface DrawingStyle {
  color: string;
  width: number;
  dash: DashStyle;
  fillOpacity: number;
}

export interface Drawing {
  id: string;
  tool: DrawingTool;
  symbol: string;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
}

export const POINTS_REQUIRED: Record<DrawingTool, number> = {
  trendline: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  rect: 2,
  "fib-retracement": 2,
  "fib-extension": 3,
  text: 1,
  measure: 2,
};

export const DEFAULT_STYLE: DrawingStyle = {
  color: "#4c8dff",
  width: 1,
  dash: "solid",
  fillOpacity: 0.12,
};

interface HistoryEntry {
  symbol: string;
  drawings: Drawing[];
}

interface DrawingsState {
  /** committed drawings, keyed by symbol */
  bySymbol: Record<string, Drawing[]>;
  activeTool: DrawingTool | null;
  selectedId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  setActiveTool: (t: DrawingTool | null) => void;
  select: (id: string | null) => void;
  addDrawing: (d: Drawing) => void;
  updateDrawing: (symbol: string, id: string, patch: Partial<Drawing>) => void;
  /** move/reshape without pushing history (during drag); commit with pushHistory first */
  updateDrawingLive: (symbol: string, id: string, patch: Partial<Drawing>) => void;
  pushHistory: (symbol: string) => void;
  deleteDrawing: (symbol: string, id: string) => void;
  clearSymbol: (symbol: string) => void;
  undo: (symbol: string) => void;
  redo: (symbol: string) => void;
}

const HISTORY_LIMIT = 64;

let counter = 0;
export function drawingId(): string {
  counter += 1;
  return `d-${Date.now().toString(36)}-${counter}`;
}

export const useDrawings = create<DrawingsState>()(
  persist(
    (set, get) => ({
      bySymbol: {},
      activeTool: null,
      selectedId: null,
      past: [],
      future: [],
      setActiveTool: (activeTool) => set({ activeTool, selectedId: null }),
      select: (selectedId) => set({ selectedId }),
      pushHistory: (symbol) =>
        set((s) => ({
          past: [
            ...s.past.slice(-(HISTORY_LIMIT - 1)),
            { symbol, drawings: s.bySymbol[symbol] ?? [] },
          ],
          future: [],
        })),
      addDrawing: (d) => {
        get().pushHistory(d.symbol);
        set((s) => ({
          bySymbol: {
            ...s.bySymbol,
            [d.symbol]: [...(s.bySymbol[d.symbol] ?? []), d],
          },
          selectedId: d.id,
          activeTool: null,
        }));
      },
      updateDrawing: (symbol, id, patch) => {
        get().pushHistory(symbol);
        get().updateDrawingLive(symbol, id, patch);
      },
      updateDrawingLive: (symbol, id, patch) =>
        set((s) => ({
          bySymbol: {
            ...s.bySymbol,
            [symbol]: (s.bySymbol[symbol] ?? []).map((d) =>
              d.id === id ? { ...d, ...patch } : d,
            ),
          },
        })),
      deleteDrawing: (symbol, id) => {
        get().pushHistory(symbol);
        set((s) => ({
          bySymbol: {
            ...s.bySymbol,
            [symbol]: (s.bySymbol[symbol] ?? []).filter((d) => d.id !== id),
          },
          selectedId: s.selectedId === id ? null : s.selectedId,
        }));
      },
      clearSymbol: (symbol) => {
        get().pushHistory(symbol);
        set((s) => ({
          bySymbol: { ...s.bySymbol, [symbol]: [] },
          selectedId: null,
        }));
      },
      undo: (symbol) =>
        set((s) => {
          for (let i = s.past.length - 1; i >= 0; i--) {
            const entry = s.past[i]!;
            if (entry.symbol !== symbol) continue;
            const past = [...s.past.slice(0, i), ...s.past.slice(i + 1)];
            const future = [
              ...s.future,
              { symbol, drawings: s.bySymbol[symbol] ?? [] },
            ];
            return {
              past,
              future,
              bySymbol: { ...s.bySymbol, [symbol]: entry.drawings },
              selectedId: null,
            };
          }
          return s;
        }),
      redo: (symbol) =>
        set((s) => {
          for (let i = s.future.length - 1; i >= 0; i--) {
            const entry = s.future[i]!;
            if (entry.symbol !== symbol) continue;
            const future = [...s.future.slice(0, i), ...s.future.slice(i + 1)];
            const past = [
              ...s.past,
              { symbol, drawings: s.bySymbol[symbol] ?? [] },
            ];
            return {
              past,
              future,
              bySymbol: { ...s.bySymbol, [symbol]: entry.drawings },
              selectedId: null,
            };
          }
          return s;
        }),
    }),
    {
      name: "tt.drawings",
      partialize: (s) => ({ bySymbol: s.bySymbol }),
    },
  ),
);
