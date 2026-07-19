import type { Candle } from "@/lib/types";
import {
  alma,
  atr,
  bollinger,
  dema,
  donchian,
  ema,
  hma,
  ichimoku,
  kama,
  macd,
  obv,
  psar,
  rsi,
  sma,
  stochastic,
  supertrend,
  tema,
  vwap,
  vwma,
  wma,
  zlema,
  type LinePoint,
  type Source,
} from "./compute";

export type IndicatorType =
  | "sma"
  | "ema"
  | "wma"
  | "vwma"
  | "hma"
  | "dema"
  | "tema"
  | "kama"
  | "alma"
  | "zlema"
  | "vwap"
  | "bollinger"
  | "donchian"
  | "supertrend"
  | "ichimoku"
  | "psar"
  | "rsi"
  | "macd"
  | "stochastic"
  | "atr"
  | "obv";

export type ParamValue = number | Source;
export type IndicatorParams = Record<string, ParamValue>;

export interface NumberParamDef {
  kind: "number";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SourceParamDef {
  kind: "source";
  key: string;
  label: string;
  default: Source;
}

export type ParamDef = NumberParamDef | SourceParamDef;

export interface LineDef {
  key: string;
  label: string;
  defaultColor: string;
  defaultWidth: 1 | 2 | 3 | 4;
  /** "points" lines are drawn as dots by the paint layer, not as a series */
  style: "line" | "histogram" | "points";
}

export interface IndicatorDef {
  type: IndicatorType;
  label: string;
  shortLabel: string;
  pane: "overlay" | "sub";
  params: ParamDef[];
  lines: LineDef[];
  /** fixed value range for the sub-pane scale, e.g. RSI 0-100 */
  levels?: number[];
  /** fill the region between two line keys (Ichimoku cloud) */
  band?: { upper: string; lower: string };
  compute: (candles: Candle[], params: IndicatorParams) => Record<string, LinePoint[]>;
}

function num(params: IndicatorParams, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function src(params: IndicatorParams, key: string, fallback: Source): Source {
  const v = params[key];
  return typeof v === "string" ? (v as Source) : fallback;
}

const SOURCES: Source[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];
export { SOURCES };

export const INDICATORS: Record<IndicatorType, IndicatorDef> = {
  sma: {
    type: "sma",
    label: "Simple Moving Average",
    shortLabel: "SMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 20 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "sma", label: "SMA", defaultColor: "#4c8dff", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ sma: sma(c, num(p, "period", 20), src(p, "source", "close")) }),
  },
  ema: {
    type: "ema",
    label: "Exponential Moving Average",
    shortLabel: "EMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 21 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "ema", label: "EMA", defaultColor: "#e2b93b", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ ema: ema(c, num(p, "period", 21), src(p, "source", "close")) }),
  },
  wma: {
    type: "wma",
    label: "Weighted Moving Average",
    shortLabel: "WMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 20 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "wma", label: "WMA", defaultColor: "#b46ee0", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ wma: wma(c, num(p, "period", 20), src(p, "source", "close")) }),
  },
  vwma: {
    type: "vwma",
    label: "Volume-Weighted Moving Average",
    shortLabel: "VWMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 20 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "vwma", label: "VWMA", defaultColor: "#fb923c", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ vwma: vwma(c, num(p, "period", 20), src(p, "source", "close")) }),
  },
  hma: {
    type: "hma",
    label: "Hull Moving Average",
    shortLabel: "HMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 21 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "hma", label: "HMA", defaultColor: "#a3e635", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ hma: hma(c, num(p, "period", 21), src(p, "source", "close")) }),
  },
  dema: {
    type: "dema",
    label: "Double EMA",
    shortLabel: "DEMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 21 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "dema", label: "DEMA", defaultColor: "#f472b6", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ dema: dema(c, num(p, "period", 21), src(p, "source", "close")) }),
  },
  tema: {
    type: "tema",
    label: "Triple EMA",
    shortLabel: "TEMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 21 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "tema", label: "TEMA", defaultColor: "#38bdf8", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ tema: tema(c, num(p, "period", 21), src(p, "source", "close")) }),
  },
  kama: {
    type: "kama",
    label: "Kaufman Adaptive MA",
    shortLabel: "KAMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 200, step: 1, default: 10 },
      { kind: "number", key: "fast", label: "Fast", min: 2, max: 50, step: 1, default: 2 },
      { kind: "number", key: "slow", label: "Slow", min: 5, max: 200, step: 1, default: 30 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "kama", label: "KAMA", defaultColor: "#e2b93b", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({
      kama: kama(c, num(p, "period", 10), num(p, "fast", 2), num(p, "slow", 30), src(p, "source", "close")),
    }),
  },
  alma: {
    type: "alma",
    label: "Arnaud Legoux MA",
    shortLabel: "ALMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 21 },
      { kind: "number", key: "offset", label: "Offset", min: 0, max: 1, step: 0.05, default: 0.85 },
      { kind: "number", key: "sigma", label: "Sigma", min: 1, max: 20, step: 0.5, default: 6 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "alma", label: "ALMA", defaultColor: "#b46ee0", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({
      alma: alma(c, num(p, "period", 21), num(p, "offset", 0.85), num(p, "sigma", 6), src(p, "source", "close")),
    }),
  },
  zlema: {
    type: "zlema",
    label: "Zero-Lag EMA",
    shortLabel: "ZLEMA",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 21 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "zlema", label: "ZLEMA", defaultColor: "#2ebd85", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ zlema: zlema(c, num(p, "period", 21), src(p, "source", "close")) }),
  },
  supertrend: {
    type: "supertrend",
    label: "SuperTrend",
    shortLabel: "ST",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "ATR Period", min: 2, max: 100, step: 1, default: 10 },
      { kind: "number", key: "mult", label: "Multiplier", min: 0.5, max: 10, step: 0.1, default: 3 },
    ],
    lines: [
      { key: "up", label: "Uptrend", defaultColor: "#2ebd85", defaultWidth: 2, style: "line" },
      { key: "down", label: "Downtrend", defaultColor: "#e5484d", defaultWidth: 2, style: "line" },
    ],
    compute: (c, p) => {
      const r = supertrend(c, num(p, "period", 10), num(p, "mult", 3));
      return { up: r.up, down: r.down };
    },
  },
  ichimoku: {
    type: "ichimoku",
    label: "Ichimoku Cloud",
    shortLabel: "Ichi",
    pane: "overlay",
    band: { upper: "senkouA", lower: "senkouB" },
    params: [
      { kind: "number", key: "tenkan", label: "Tenkan", min: 2, max: 100, step: 1, default: 9 },
      { kind: "number", key: "kijun", label: "Kijun", min: 2, max: 200, step: 1, default: 26 },
      { kind: "number", key: "senkouB", label: "Senkou B", min: 2, max: 300, step: 1, default: 52 },
      { kind: "number", key: "displacement", label: "Displacement", min: 1, max: 100, step: 1, default: 26 },
    ],
    lines: [
      { key: "tenkan", label: "Tenkan-sen", defaultColor: "#4c8dff", defaultWidth: 1, style: "line" },
      { key: "kijun", label: "Kijun-sen", defaultColor: "#e5484d", defaultWidth: 1, style: "line" },
      { key: "senkouA", label: "Senkou A", defaultColor: "#2ebd85", defaultWidth: 1, style: "line" },
      { key: "senkouB", label: "Senkou B", defaultColor: "#e5484d", defaultWidth: 1, style: "line" },
      { key: "chikou", label: "Chikou", defaultColor: "#b46ee0", defaultWidth: 1, style: "line" },
    ],
    compute: (c, p) => {
      const r = ichimoku(
        c,
        num(p, "tenkan", 9),
        num(p, "kijun", 26),
        num(p, "senkouB", 52),
        num(p, "displacement", 26),
      );
      return {
        tenkan: r.tenkan,
        kijun: r.kijun,
        senkouA: r.senkouA,
        senkouB: r.senkouB,
        chikou: r.chikou,
      };
    },
  },
  psar: {
    type: "psar",
    label: "Parabolic SAR",
    shortLabel: "SAR",
    pane: "overlay",
    params: [
      { kind: "number", key: "step", label: "Step", min: 0.01, max: 0.2, step: 0.01, default: 0.02 },
      { kind: "number", key: "max", label: "Max", min: 0.1, max: 1, step: 0.05, default: 0.2 },
    ],
    lines: [{ key: "psar", label: "SAR", defaultColor: "#e2b93b", defaultWidth: 1, style: "points" }],
    compute: (c, p) => ({ psar: psar(c, num(p, "step", 0.02), num(p, "max", 0.2)) }),
  },
  vwap: {
    type: "vwap",
    label: "VWAP (rolling)",
    shortLabel: "VWAP",
    pane: "overlay",
    params: [],
    lines: [{ key: "vwap", label: "VWAP", defaultColor: "#38bdf8", defaultWidth: 1, style: "line" }],
    compute: (c) => ({ vwap: vwap(c) }),
  },
  bollinger: {
    type: "bollinger",
    label: "Bollinger Bands",
    shortLabel: "BB",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 20 },
      { kind: "number", key: "mult", label: "StdDev", min: 0.5, max: 6, step: 0.1, default: 2 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [
      { key: "basis", label: "Basis", defaultColor: "#4c8dff", defaultWidth: 1, style: "line" },
      { key: "upper", label: "Upper", defaultColor: "#7aa5e8", defaultWidth: 1, style: "line" },
      { key: "lower", label: "Lower", defaultColor: "#7aa5e8", defaultWidth: 1, style: "line" },
    ],
    compute: (c, p) => {
      const r = bollinger(c, num(p, "period", 20), num(p, "mult", 2), src(p, "source", "close"));
      return { basis: r.basis, upper: r.upper, lower: r.lower };
    },
  },
  donchian: {
    type: "donchian",
    label: "Donchian Channels",
    shortLabel: "DC",
    pane: "overlay",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 500, step: 1, default: 20 },
    ],
    lines: [
      { key: "upper", label: "Upper", defaultColor: "#2ebd85", defaultWidth: 1, style: "line" },
      { key: "middle", label: "Middle", defaultColor: "#98a3b3", defaultWidth: 1, style: "line" },
      { key: "lower", label: "Lower", defaultColor: "#e5484d", defaultWidth: 1, style: "line" },
    ],
    compute: (c, p) => {
      const r = donchian(c, num(p, "period", 20));
      return { upper: r.upper, middle: r.middle, lower: r.lower };
    },
  },
  rsi: {
    type: "rsi",
    label: "Relative Strength Index",
    shortLabel: "RSI",
    pane: "sub",
    levels: [30, 70],
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 200, step: 1, default: 14 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [{ key: "rsi", label: "RSI", defaultColor: "#b46ee0", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ rsi: rsi(c, num(p, "period", 14), src(p, "source", "close")) }),
  },
  macd: {
    type: "macd",
    label: "MACD",
    shortLabel: "MACD",
    pane: "sub",
    levels: [0],
    params: [
      { kind: "number", key: "fast", label: "Fast", min: 2, max: 200, step: 1, default: 12 },
      { kind: "number", key: "slow", label: "Slow", min: 2, max: 300, step: 1, default: 26 },
      { kind: "number", key: "signal", label: "Signal", min: 2, max: 100, step: 1, default: 9 },
      { kind: "source", key: "source", label: "Source", default: "close" },
    ],
    lines: [
      { key: "histogram", label: "Histogram", defaultColor: "#98a3b3", defaultWidth: 1, style: "histogram" },
      { key: "macd", label: "MACD", defaultColor: "#4c8dff", defaultWidth: 1, style: "line" },
      { key: "signal", label: "Signal", defaultColor: "#e2b93b", defaultWidth: 1, style: "line" },
    ],
    compute: (c, p) => {
      const r = macd(
        c,
        num(p, "fast", 12),
        num(p, "slow", 26),
        num(p, "signal", 9),
        src(p, "source", "close"),
      );
      return { histogram: r.histogram, macd: r.macd, signal: r.signal };
    },
  },
  stochastic: {
    type: "stochastic",
    label: "Stochastic",
    shortLabel: "Stoch",
    pane: "sub",
    levels: [20, 80],
    params: [
      { kind: "number", key: "k", label: "%K Period", min: 2, max: 200, step: 1, default: 14 },
      { kind: "number", key: "kSmooth", label: "%K Smooth", min: 1, max: 50, step: 1, default: 3 },
      { kind: "number", key: "d", label: "%D Period", min: 1, max: 50, step: 1, default: 3 },
    ],
    lines: [
      { key: "k", label: "%K", defaultColor: "#4c8dff", defaultWidth: 1, style: "line" },
      { key: "d", label: "%D", defaultColor: "#e2b93b", defaultWidth: 1, style: "line" },
    ],
    compute: (c, p) => {
      const r = stochastic(c, num(p, "k", 14), num(p, "kSmooth", 3), num(p, "d", 3));
      return { k: r.k, d: r.d };
    },
  },
  atr: {
    type: "atr",
    label: "Average True Range",
    shortLabel: "ATR",
    pane: "sub",
    params: [
      { kind: "number", key: "period", label: "Period", min: 2, max: 200, step: 1, default: 14 },
    ],
    lines: [{ key: "atr", label: "ATR", defaultColor: "#e2b93b", defaultWidth: 1, style: "line" }],
    compute: (c, p) => ({ atr: atr(c, num(p, "period", 14)) }),
  },
  obv: {
    type: "obv",
    label: "On-Balance Volume",
    shortLabel: "OBV",
    pane: "sub",
    params: [],
    lines: [{ key: "obv", label: "OBV", defaultColor: "#38bdf8", defaultWidth: 1, style: "line" }],
    compute: (c) => ({ obv: obv(c) }),
  },
};

export function defaultParams(def: IndicatorDef): IndicatorParams {
  const out: IndicatorParams = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}

export function defaultColors(def: IndicatorDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of def.lines) out[l.key] = l.defaultColor;
  return out;
}

export function defaultWidths(def: IndicatorDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of def.lines) out[l.key] = l.defaultWidth;
  return out;
}

/** Compact label like "EMA 21 close" for legends and chips. */
export function instanceLabel(type: IndicatorType, params: IndicatorParams): string {
  const def = INDICATORS[type];
  const parts: string[] = [def.shortLabel];
  for (const p of def.params) {
    const v = params[p.key];
    if (v !== undefined) parts.push(String(v));
  }
  return parts.join(" ");
}
