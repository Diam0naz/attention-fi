"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  defaultColors,
  defaultParams,
  defaultWidths,
  INDICATORS,
  type IndicatorParams,
  type IndicatorType,
  type ParamValue,
} from "@/lib/indicators/registry";

export interface IndicatorInstance {
  id: string;
  type: IndicatorType;
  params: IndicatorParams;
  colors: Record<string, string>;
  widths: Record<string, number>;
  visible: boolean;
}

interface IndicatorsState {
  instances: IndicatorInstance[];
  showVolume: boolean;
  add: (type: IndicatorType) => void;
  remove: (id: string) => void;
  setParam: (id: string, key: string, value: ParamValue) => void;
  setColor: (id: string, lineKey: string, color: string) => void;
  setWidth: (id: string, lineKey: string, width: number) => void;
  toggleVisible: (id: string) => void;
  toggleVolume: () => void;
}

let counter = 0;
function nextId(type: string): string {
  counter += 1;
  return `${type}-${Date.now().toString(36)}-${counter}`;
}

export const useIndicators = create<IndicatorsState>()(
  persist(
    (set) => ({
      instances: [],
      showVolume: true,
      add: (type) =>
        set((s) => {
          const def = INDICATORS[type];
          const instance: IndicatorInstance = {
            id: nextId(type),
            type,
            params: defaultParams(def),
            colors: defaultColors(def),
            widths: defaultWidths(def),
            visible: true,
          };
          return { instances: [...s.instances, instance] };
        }),
      remove: (id) =>
        set((s) => ({ instances: s.instances.filter((i) => i.id !== id) })),
      setParam: (id, key, value) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, params: { ...i.params, [key]: value } } : i,
          ),
        })),
      setColor: (id, lineKey, color) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, colors: { ...i.colors, [lineKey]: color } } : i,
          ),
        })),
      setWidth: (id, lineKey, width) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, widths: { ...i.widths, [lineKey]: width } } : i,
          ),
        })),
      toggleVisible: (id) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, visible: !i.visible } : i,
          ),
        })),
      toggleVolume: () => set((s) => ({ showVolume: !s.showVolume })),
    }),
    { name: "tt.indicators" },
  ),
);
