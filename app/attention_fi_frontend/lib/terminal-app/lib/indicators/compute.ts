import type { Candle } from "@/lib/terminal-app/lib/types";

export type Source = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";

export interface LinePoint {
  time: number;
  value: number;
}

export function sourceValue(c: Candle, source: Source): number {
  switch (source) {
    case "open":
      return c.open;
    case "high":
      return c.high;
    case "low":
      return c.low;
    case "close":
      return c.close;
    case "hl2":
      return (c.high + c.low) / 2;
    case "hlc3":
      return (c.high + c.low + c.close) / 3;
    case "ohlc4":
      return (c.open + c.high + c.low + c.close) / 4;
  }
}

function extract(candles: Candle[], source: Source): number[] {
  const out = new Array<number>(candles.length);
  for (let i = 0; i < candles.length; i++) {
    out[i] = sourceValue(candles[i]!, source);
  }
  return out;
}

/** Map raw values back to time-stamped points, skipping NaN warmup values. */
function toPoints(candles: Candle[], values: number[]): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) out.push({ time: candles[i]!.time, value: v });
  }
  return out;
}

function smaValues(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function emaValues(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let ema = seed / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/** Wilder's smoothing (RMA), used by RSI and ATR. */
function rmaValues(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let rma = seed / period;
  out[period - 1] = rma;
  for (let i = period; i < values.length; i++) {
    rma = (rma * (period - 1) + values[i]!) / period;
    out[i] = rma;
  }
  return out;
}

export function sma(candles: Candle[], period: number, source: Source): LinePoint[] {
  return toPoints(candles, smaValues(extract(candles, source), period));
}

export function ema(candles: Candle[], period: number, source: Source): LinePoint[] {
  return toPoints(candles, emaValues(extract(candles, source), period));
}

function wmaValues(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = values[i - j]!;
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      acc += v * (period - j);
    }
    if (ok) out[i] = acc / denom;
  }
  return out;
}

export function wma(candles: Candle[], period: number, source: Source): LinePoint[] {
  return toPoints(candles, wmaValues(extract(candles, source), period));
}

/**
 * Rolling VWAP anchored to the first loaded bar. Crypto trades continuously,
 * so there is no session boundary to anchor to; the anchor moves as older
 * history is backfilled, which is documented behavior.
 */
export function vwap(candles: Candle[]): LinePoint[] {
  const out: LinePoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    if (cumV > 0) out.push({ time: c.time, value: cumPV / cumV });
  }
  return out;
}

export function bollinger(
  candles: Candle[],
  period: number,
  mult: number,
  source: Source,
): { basis: LinePoint[]; upper: LinePoint[]; lower: LinePoint[] } {
  const values = extract(candles, source);
  const basis = smaValues(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const mean = basis[i]!;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j]! - mean;
      acc += d * d;
    }
    const sd = Math.sqrt(acc / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return {
    basis: toPoints(candles, basis),
    upper: toPoints(candles, upper),
    lower: toPoints(candles, lower),
  };
}

export function donchian(
  candles: Candle[],
  period: number,
): { upper: LinePoint[]; lower: LinePoint[]; middle: LinePoint[] } {
  const upper = new Array<number>(candles.length).fill(NaN);
  const lower = new Array<number>(candles.length).fill(NaN);
  const middle = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j]!;
      if (c.high > hh) hh = c.high;
      if (c.low < ll) ll = c.low;
    }
    upper[i] = hh;
    lower[i] = ll;
    middle[i] = (hh + ll) / 2;
  }
  return {
    upper: toPoints(candles, upper),
    lower: toPoints(candles, lower),
    middle: toPoints(candles, middle),
  };
}

export function rsi(candles: Candle[], period: number, source: Source): LinePoint[] {
  const values = extract(candles, source);
  if (values.length < 2) return [];
  const gains = new Array<number>(values.length - 1);
  const losses = new Array<number>(values.length - 1);
  for (let i = 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gains[i - 1] = d > 0 ? d : 0;
    losses[i - 1] = d < 0 ? -d : 0;
  }
  const avgGain = rmaValues(gains, period);
  const avgLoss = rmaValues(losses, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < gains.length; i++) {
    const g = avgGain[i]!;
    const l = avgLoss[i]!;
    if (!Number.isFinite(g) || !Number.isFinite(l)) continue;
    out[i + 1] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return toPoints(candles, out);
}

export function macd(
  candles: Candle[],
  fast: number,
  slow: number,
  signalPeriod: number,
  source: Source,
): { macd: LinePoint[]; signal: LinePoint[]; histogram: LinePoint[] } {
  const values = extract(candles, source);
  const fastE = emaValues(values, fast);
  const slowE = emaValues(values, slow);
  const macdRaw = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    const f = fastE[i]!;
    const s = slowE[i]!;
    if (Number.isFinite(f) && Number.isFinite(s)) macdRaw[i] = f - s;
  }
  // signal EMA over the valid macd segment
  const firstValid = macdRaw.findIndex((v) => Number.isFinite(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstValid >= 0) {
    const seg = macdRaw.slice(firstValid);
    const segSignal = emaValues(seg, signalPeriod);
    for (let i = 0; i < segSignal.length; i++) {
      signal[firstValid + i] = segSignal[i]!;
    }
  }
  const histogram = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    const m = macdRaw[i]!;
    const s = signal[i]!;
    if (Number.isFinite(m) && Number.isFinite(s)) histogram[i] = m - s;
  }
  return {
    macd: toPoints(candles, macdRaw),
    signal: toPoints(candles, signal),
    histogram: toPoints(candles, histogram),
  };
}

export function stochastic(
  candles: Candle[],
  kPeriod: number,
  kSmooth: number,
  dPeriod: number,
): { k: LinePoint[]; d: LinePoint[] } {
  const raw = new Array<number>(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      const c = candles[j]!;
      if (c.high > hh) hh = c.high;
      if (c.low < ll) ll = c.low;
    }
    const range = hh - ll;
    raw[i] = range === 0 ? 50 : ((candles[i]!.close - ll) / range) * 100;
  }
  const k = smaNaN(raw, kSmooth);
  const d = smaNaN(k, dPeriod);
  return { k: toPoints(candles, k), d: toPoints(candles, d) };
}

/** SMA that tolerates NaN warmup prefixes. */
function smaNaN(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let acc = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j]!;
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      acc += v;
    }
    if (ok) out[i] = acc / period;
  }
  return out;
}

export function atr(candles: Candle[], period: number): LinePoint[] {
  if (candles.length < 2) return [];
  const tr = new Array<number>(candles.length - 1);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    tr[i - 1] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
  }
  const smoothed = rmaValues(tr, period);
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i]!;
  return toPoints(candles, out);
}

export function vwma(candles: Candle[], period: number, source: Source): LinePoint[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j]!;
      pv += sourceValue(c, source) * c.volume;
      v += c.volume;
    }
    if (v > 0) out[i] = pv / v;
  }
  return toPoints(candles, out);
}

/** Hull MA: WMA(2·WMA(n/2) − WMA(n), √n) — fast and smooth. */
export function hma(candles: Candle[], period: number, source: Source): LinePoint[] {
  const values = extract(candles, source);
  const half = wmaValues(values, Math.max(1, Math.round(period / 2)));
  const full = wmaValues(values, period);
  const diff = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    const h = half[i]!;
    const f = full[i]!;
    if (Number.isFinite(h) && Number.isFinite(f)) diff[i] = 2 * h - f;
  }
  return toPoints(candles, wmaValues(diff, Math.max(1, Math.round(Math.sqrt(period)))));
}

/** EMA of a possibly-NaN-prefixed series, seeded at the first valid run. */
function emaValuesNaN(values: number[], period: number): number[] {
  const first = values.findIndex((v) => Number.isFinite(v));
  const out = new Array<number>(values.length).fill(NaN);
  if (first < 0) return out;
  const seg = emaValues(values.slice(first), period);
  for (let i = 0; i < seg.length; i++) out[first + i] = seg[i]!;
  return out;
}

export function dema(candles: Candle[], period: number, source: Source): LinePoint[] {
  const values = extract(candles, source);
  const e1 = emaValues(values, period);
  const e2 = emaValuesNaN(e1, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    const a = e1[i]!;
    const b = e2[i]!;
    if (Number.isFinite(a) && Number.isFinite(b)) out[i] = 2 * a - b;
  }
  return toPoints(candles, out);
}

export function tema(candles: Candle[], period: number, source: Source): LinePoint[] {
  const values = extract(candles, source);
  const e1 = emaValues(values, period);
  const e2 = emaValuesNaN(e1, period);
  const e3 = emaValuesNaN(e2, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    const a = e1[i]!;
    const b = e2[i]!;
    const c = e3[i]!;
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
      out[i] = 3 * a - 3 * b + c;
    }
  }
  return toPoints(candles, out);
}

/** Kaufman adaptive MA: efficiency-ratio-scaled smoothing constant. */
export function kama(
  candles: Candle[],
  period: number,
  fast: number,
  slow: number,
  source: Source,
): LinePoint[] {
  const values = extract(candles, source);
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return [];
  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const change = Math.abs(values[i]! - values[i - period]!);
    let volatility = 0;
    for (let j = i - period + 1; j <= i; j++) {
      volatility += Math.abs(values[j]! - values[j - 1]!);
    }
    const er = volatility === 0 ? 0 : change / volatility;
    const sc = (er * (fastSC - slowSC) + slowSC) ** 2;
    prev = prev + sc * (values[i]! - prev);
    out[i] = prev;
  }
  return toPoints(candles, out);
}

/** Arnaud Legoux MA: gaussian-weighted with configurable offset/sigma. */
export function alma(
  candles: Candle[],
  period: number,
  offset: number,
  sigma: number,
  source: Source,
): LinePoint[] {
  const values = extract(candles, source);
  const out = new Array<number>(values.length).fill(NaN);
  const m = offset * (period - 1);
  const s = period / sigma;
  const weights = new Array<number>(period);
  let norm = 0;
  for (let i = 0; i < period; i++) {
    weights[i] = Math.exp(-((i - m) ** 2) / (2 * s * s));
    norm += weights[i]!;
  }
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) {
      acc += values[i - period + 1 + j]! * weights[j]!;
    }
    out[i] = acc / norm;
  }
  return toPoints(candles, out);
}

/** Zero-lag EMA: EMA of (2·price − price[lag]). */
export function zlema(candles: Candle[], period: number, source: Source): LinePoint[] {
  const values = extract(candles, source);
  const lag = Math.floor((period - 1) / 2);
  const adjusted = new Array<number>(values.length).fill(NaN);
  for (let i = lag; i < values.length; i++) {
    adjusted[i] = 2 * values[i]! - values[i - lag]!;
  }
  return toPoints(candles, emaValuesNaN(adjusted, period));
}

/** raw ATR values (Wilder), aligned to candle indices */
function atrValues(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length < 2) return out;
  const tr = new Array<number>(candles.length - 1);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    tr[i - 1] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
  }
  const smoothed = rmaValues(tr, period);
  for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i]!;
  return out;
}

/**
 * SuperTrend. Returns two series with NaN sentinels where each side is
 * inactive; renderers map NaN to whitespace so segments don't bridge flips.
 */
export function supertrend(
  candles: Candle[],
  period: number,
  mult: number,
): { up: LinePoint[]; down: LinePoint[] } {
  const n = candles.length;
  const atr = atrValues(candles, period);
  const up: LinePoint[] = [];
  const down: LinePoint[] = [];
  let finalUpper = NaN;
  let finalLower = NaN;
  let trend = 1; // 1 = uptrend (line below price), -1 = downtrend
  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const a = atr[i]!;
    if (!Number.isFinite(a)) {
      up.push({ time: c.time, value: NaN });
      down.push({ time: c.time, value: NaN });
      continue;
    }
    const mid = (c.high + c.low) / 2;
    const basicUpper = mid + mult * a;
    const basicLower = mid - mult * a;
    const prevClose = i > 0 ? candles[i - 1]!.close : c.close;
    finalUpper =
      !Number.isFinite(finalUpper) || basicUpper < finalUpper || prevClose > finalUpper
        ? basicUpper
        : finalUpper;
    finalLower =
      !Number.isFinite(finalLower) || basicLower > finalLower || prevClose < finalLower
        ? basicLower
        : finalLower;
    if (trend === 1 && c.close < finalLower) trend = -1;
    else if (trend === -1 && c.close > finalUpper) trend = 1;
    up.push({ time: c.time, value: trend === 1 ? finalLower : NaN });
    down.push({ time: c.time, value: trend === -1 ? finalUpper : NaN });
  }
  return { up, down };
}

function midpointOf(candles: Candle[], end: number, period: number): number {
  let hh = -Infinity;
  let ll = Infinity;
  for (let j = end - period + 1; j <= end; j++) {
    const c = candles[j]!;
    if (c.high > hh) hh = c.high;
    if (c.low < ll) ll = c.low;
  }
  return (hh + ll) / 2;
}

/**
 * Ichimoku. Senkou spans are displaced forward and Chikou backward in *time*
 * (bar-interval multiples), so the cloud extends past the last candle.
 */
export function ichimoku(
  candles: Candle[],
  tenkanPeriod: number,
  kijunPeriod: number,
  senkouBPeriod: number,
  displacement: number,
): {
  tenkan: LinePoint[];
  kijun: LinePoint[];
  senkouA: LinePoint[];
  senkouB: LinePoint[];
  chikou: LinePoint[];
} {
  const n = candles.length;
  const tenkan: LinePoint[] = [];
  const kijun: LinePoint[] = [];
  const senkouA: LinePoint[] = [];
  const senkouB: LinePoint[] = [];
  const chikou: LinePoint[] = [];
  if (n < 2) return { tenkan, kijun, senkouA, senkouB, chikou };
  const bar = candles[1]!.time - candles[0]!.time;
  const shift = displacement * bar;
  for (let i = 0; i < n; i++) {
    const t = candles[i]!.time;
    if (i >= tenkanPeriod - 1) {
      const tv = midpointOf(candles, i, tenkanPeriod);
      tenkan.push({ time: t, value: tv });
      if (i >= kijunPeriod - 1) {
        const kv = midpointOf(candles, i, kijunPeriod);
        senkouA.push({ time: t + shift, value: (tv + kv) / 2 });
      }
    }
    if (i >= kijunPeriod - 1) {
      kijun.push({ time: t, value: midpointOf(candles, i, kijunPeriod) });
    }
    if (i >= senkouBPeriod - 1) {
      senkouB.push({ time: t + shift, value: midpointOf(candles, i, senkouBPeriod) });
    }
    if (i >= displacement) {
      chikou.push({ time: t - shift, value: candles[i]!.close });
    }
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/** Parabolic SAR (Wilder): rendered as dots by the indicator paint layer. */
export function psar(candles: Candle[], step: number, max: number): LinePoint[] {
  const n = candles.length;
  if (n < 2) return [];
  const out: LinePoint[] = [];
  let uptrend = candles[1]!.close >= candles[0]!.close;
  let sar = uptrend ? candles[0]!.low : candles[0]!.high;
  let ep = uptrend ? candles[0]!.high : candles[0]!.low;
  let af = step;
  for (let i = 1; i < n; i++) {
    const c = candles[i]!;
    sar = sar + af * (ep - sar);
    if (uptrend) {
      sar = Math.min(sar, candles[i - 1]!.low, i > 1 ? candles[i - 2]!.low : candles[i - 1]!.low);
      if (c.low < sar) {
        uptrend = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(max, af + step);
      }
    } else {
      sar = Math.max(sar, candles[i - 1]!.high, i > 1 ? candles[i - 2]!.high : candles[i - 1]!.high);
      if (c.high > sar) {
        uptrend = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else if (c.low < ep) {
        ep = c.low;
        af = Math.min(max, af + step);
      }
    }
    out.push({ time: c.time, value: sar });
  }
  return out;
}

export function obv(candles: Candle[]): LinePoint[] {
  const out: LinePoint[] = [];
  let acc = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i > 0) {
      const prev = candles[i - 1]!;
      if (c.close > prev.close) acc += c.volume;
      else if (c.close < prev.close) acc -= c.volume;
    }
    out.push({ time: c.time, value: acc });
  }
  return out;
}
