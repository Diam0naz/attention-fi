import type { Candle } from "@/lib/types";

/**
 * Heikin-Ashi transform. Each bar smooths the raw OHLC:
 *   haClose = (o+h+l+c)/4
 *   haOpen  = (prevHaOpen + prevHaClose)/2
 *   haHigh  = max(h, haOpen, haClose), haLow = min(l, haOpen, haClose)
 */
export function toHeikinAshi(candles: Candle[]): Candle[] {
  const out = new Array<Candle>(candles.length);
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
    out[i] = {
      time: c.time,
      open: haOpen,
      high: Math.max(c.high, haOpen, haClose),
      low: Math.min(c.low, haOpen, haClose),
      close: haClose,
      volume: c.volume,
    };
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
}
