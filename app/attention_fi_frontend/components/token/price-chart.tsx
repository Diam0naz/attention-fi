"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import { getChartSeries } from "@/lib/mock-data";

/** Professional candlestick + volume chart (TradingView lightweight-charts). */
export function PriceChart({ handle, marketCap }: { handle: string; marketCap: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { candles, volumes } = useMemo(() => getChartSeries(handle, marketCap), [handle, marketCap]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#6B6B6B",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(0,255,133,0.35)", labelBackgroundColor: "#00ff85" },
        horzLine: { color: "rgba(0,255,133,0.35)", labelBackgroundColor: "#00ff85" },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00ff85",
      downColor: "#ff3b5c",
      wickUpColor: "#00ff85",
      wickDownColor: "#ff3b5c",
      borderVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    candleSeries.setData(
      candles.map(
        (c): CandlestickData => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }),
      ),
    );

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(
      volumes.map((v): HistogramData => ({ time: v.time as UTCTimestamp, value: v.value, color: v.color })),
    );

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, volumes]);

  return <div ref={ref} className="h-[300px] w-full sm:h-[340px]" />;
}
