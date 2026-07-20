"use client";

import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
  type MouseEventParams,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { DrawingLayer } from "@/lib/terminal-app/components/chart/DrawingLayer";
import { IndicatorPaintLayer } from "@/lib/terminal-app/components/chart/IndicatorPaintLayer";
import type { PaneSyncApi } from "@/lib/terminal-app/components/chart/ChartWorkspace";
import { readChartTheme, type ChartTheme } from "@/lib/terminal-app/lib/chart/theme";
import { toHeikinAshi } from "@/lib/terminal-app/lib/chart/heikinAshi";
import type { CandleFeed } from "@/lib/terminal-app/lib/chart/feed";
import { INDICATORS } from "@/lib/terminal-app/lib/indicators/registry";
import { fmtCompact, fmtCountdown, fmtPercent, fmtPrice } from "@/lib/terminal-app/lib/format";
import type { Candle, ChartType } from "@/lib/terminal-app/lib/types";
import { useIndicators } from "@/lib/terminal-app/stores/indicators";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { useTrading } from "@/lib/terminal-app/stores/trading";

const BACKFILL_TRIGGER_BARS = 60;

const EMPTY_ORDERS: import("@/lib/terminal-app/stores/trading").Order[] = [];

interface ChartPaneProps {
  paneId: string;
  feed: CandleFeed;
  symbol: string;
  sync: PaneSyncApi;
  /** the primary pane hosts drawings and order/position lines */
  isPrimary: boolean;
}

type MainSeries = ISeriesApi<SeriesType>;

function ts(t: number): UTCTimestamp {
  return t as UTCTimestamp;
}

function toCandleData(candles: Candle[]): CandlestickData[] {
  return candles.map((c) => ({
    time: ts(c.time),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

function toLineData(candles: Candle[]): LineData[] {
  return candles.map((c) => ({ time: ts(c.time), value: c.close }));
}

function toVolumeData(candles: Candle[], theme: ChartTheme): HistogramData[] {
  return candles.map((c) => ({
    time: ts(c.time),
    value: c.volume,
    color: c.close >= c.open ? theme.upMuted : theme.downMuted,
  }));
}

export function ChartPane({ paneId, feed, symbol, sync, isPrimary }: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const countdownRef = useRef<HTMLDivElement | null>(null);

  const chartType = useSettings((s) => s.chartType);
  const priceScale = useSettings((s) => s.priceScale);
  const theme = useSettings((s) => s.theme);
  const crosshairLocked = useSettings((s) => s.crosshairLocked);

  const overlayInstances = useIndicators((s) => s.instances).filter(
    (i) => INDICATORS[i.type].pane === "overlay",
  );
  const overlayKey = useMemo(() => JSON.stringify(overlayInstances), [overlayInstances]);
  // read through a ref inside feed-event callbacks so backfill events never
  // recompute against a stale indicator list
  const overlayInstancesRef = useRef(overlayInstances);
  overlayInstancesRef.current = overlayInstances;
  const showVolume = useIndicators((s) => s.showVolume);

  const [chartHandles, setChartHandles] = useState<{
    chart: IChartApi;
    series: MainSeries;
  } | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<MainSeries | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const haRef = useRef<Candle[]>([]);
  const applyingRange = useRef(false);
  const lockedCrosshair = useRef<{ time: number; price: number } | null>(null);
  const lastIndicatorCompute = useRef(0);
  const rafPending = useRef(false);

  /* ----- chart lifecycle ------------------------------------------------ */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = readChartTheme();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: t.text,
        fontFamily: t.fontNum,
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: t.crosshair, width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: t.accent },
        horzLine: { color: t.crosshair, width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: t.accent },
      },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 7,
      },
      rightPriceScale: {
        borderColor: t.border,
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      localization: {
        priceFormatter: (p: number) => fmtPrice(p),
      },
    });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      overlaySeriesRef.current.clear();
      chart.remove();
    };
  }, []);

  /* ----- theme reactivity ---------------------------------------------- */

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // read tokens after the class flip has been applied to <html>
    requestAnimationFrame(() => {
      const t = readChartTheme();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: t.text,
        },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
        crosshair: {
          vertLine: { color: t.crosshair, labelBackgroundColor: t.accent },
          horzLine: { color: t.crosshair, labelBackgroundColor: t.accent },
        },
        timeScale: { borderColor: t.border },
        rightPriceScale: { borderColor: t.border },
      });
      applyMainSeriesTheme(seriesRef.current, chartType, t);
      if (volumeRef.current) {
        volumeRef.current.setData(toVolumeData(sourceCandles(), t));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  /* ----- main series per chart type ------------------------------------ */

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    const t = readChartTheme();
    const series = createMainSeries(chart, chartType, t);
    seriesRef.current = series;
    pushHistory();
    setChartHandles({ chart, series });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, feed]);

  /* ----- volume toggle -------------------------------------------------- */

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (showVolume && !volumeRef.current) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      vol.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        visible: false,
      });
      volumeRef.current = vol;
      vol.setData(toVolumeData(feed.candles, readChartTheme()));
    } else if (!showVolume && volumeRef.current) {
      chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }
  }, [showVolume, feed]);

  /* ----- price scale mode ---------------------------------------------- */

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const mode =
      priceScale === "log"
        ? PriceScaleMode.Logarithmic
        : priceScale === "percent"
          ? PriceScaleMode.Percentage
          : PriceScaleMode.Normal;
    chart.priceScale("right").applyOptions({ mode });
  }, [priceScale]);

  /* ----- data flow ------------------------------------------------------ */

  function sourceCandles(): Candle[] {
    if (chartType === "heikin-ashi") {
      if (haRef.current.length !== feed.candles.length) {
        haRef.current = toHeikinAshi(feed.candles);
      }
      return haRef.current;
    }
    return feed.candles;
  }

  function pushHistory() {
    const series = seriesRef.current;
    if (!series) return;
    haRef.current = chartType === "heikin-ashi" ? toHeikinAshi(feed.candles) : [];
    const data = sourceCandles();
    if (isOhlcType(chartType)) {
      series.setData(toCandleData(data));
    } else {
      series.setData(toLineData(data));
    }
    volumeRef.current?.setData(toVolumeData(data, readChartTheme()));
    recomputeOverlays(true);
    updateLegendToLast();
  }

  function pushLive() {
    const series = seriesRef.current;
    if (!series || feed.candles.length === 0) return;
    let bar: Candle;
    if (chartType === "heikin-ashi") {
      // incremental HA: recompute only the trailing bar
      const raw = feed.candles;
      const ha = haRef.current;
      const i = raw.length - 1;
      if (ha.length < raw.length) {
        haRef.current = toHeikinAshi(raw);
      } else {
        const c = raw[i]!;
        const prev = i > 0 ? ha[i - 1]! : null;
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
        ha[i] = {
          time: c.time,
          open: haOpen,
          high: Math.max(c.high, haOpen, haClose),
          low: Math.min(c.low, haOpen, haClose),
          close: haClose,
          volume: c.volume,
        };
      }
      bar = haRef.current[haRef.current.length - 1]!;
    } else {
      bar = feed.candles[feed.candles.length - 1]!;
    }

    if (isOhlcType(chartType)) {
      series.update({
        time: ts(bar.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
    } else {
      series.update({ time: ts(bar.time), value: bar.close });
    }
    const t = readChartTheme();
    volumeRef.current?.update({
      time: ts(bar.time),
      value: bar.volume,
      color: bar.close >= bar.open ? t.upMuted : t.downMuted,
    });
    // throttle indicator recompute to ~3/s; ticks can arrive far faster
    const now = performance.now();
    if (now - lastIndicatorCompute.current > 300 && !rafPending.current) {
      rafPending.current = true;
      requestAnimationFrame(() => {
        rafPending.current = false;
        lastIndicatorCompute.current = performance.now();
        recomputeOverlays(false);
      });
    }
    updateLegendToLast();
  }

  useEffect(() => {
    const unsub = feed.subscribe((event) => {
      if (event === "history") pushHistory();
      else pushLive();
    });
    if (feed.candles.length > 0) pushHistory();
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, chartType]);

  /* ----- overlay indicators --------------------------------------------- */

  function recomputeOverlays(recreate: boolean) {
    const chart = chartRef.current;
    if (!chart) return;
    const map = overlaySeriesRef.current;
    if (recreate) {
      for (const s of map.values()) chart.removeSeries(s);
      map.clear();
    }
    for (const inst of overlayInstancesRef.current) {
      if (!inst.visible) continue;
      const def = INDICATORS[inst.type];
      const results = def.compute(feed.candles, inst.params);
      for (const line of def.lines) {
        // dot-rendered lines (PSAR) belong to the paint layer, not a series
        if (line.style === "points") continue;
        const key = `${inst.id}:${line.key}`;
        let s = map.get(key);
        if (!s) {
          s = chart.addSeries(LineSeries, {
            color: inst.colors[line.key] ?? line.defaultColor,
            lineWidth: (inst.widths[line.key] ?? line.defaultWidth) as 1 | 2 | 3 | 4,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          map.set(key, s);
        }
        const pts = results[line.key] ?? [];
        // NaN sentinels become whitespace so segments don't bridge gaps
        s.setData(
          pts.map((p) =>
            Number.isFinite(p.value)
              ? { time: ts(p.time), value: p.value }
              : { time: ts(p.time) },
          ),
        );
      }
    }
  }

  useEffect(() => {
    recomputeOverlays(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  /* ----- infinite history scroll ---------------------------------------- */

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const onRange = (range: LogicalRange | null) => {
      if (!range) return;
      if (range.from < BACKFILL_TRIGGER_BARS) void feed.loadOlder();
      if (!applyingRange.current) sync.publishRange(paneId, range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
  }, [feed, paneId, sync]);

  /* ----- workspace sync registration ------------------------------------ */

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    return sync.register(paneId, {
      applyRange: (range) => {
        applyingRange.current = true;
        chart.timeScale().setVisibleLogicalRange(range);
        applyingRange.current = false;
      },
      applyCrosshair: (time) => {
        if (time === null) {
          chart.clearCrosshairPosition();
          return;
        }
        const bar = findCandle(feed.candles, time);
        if (bar) chart.setCrosshairPosition(bar.close, ts(bar.time), series);
      },
    });
  }, [paneId, sync, feed, chartHandles]);

  /* ----- crosshair: legend + sync + lock -------------------------------- */

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const onMove = (param: MouseEventParams) => {
      if (crosshairLocked && lockedCrosshair.current) {
        const l = lockedCrosshair.current;
        chart.setCrosshairPosition(l.price, ts(l.time), series);
        return;
      }
      const time = typeof param.time === "number" ? param.time : null;
      if (time !== null) {
        const bar = findCandle(feed.candles, time);
        if (bar) {
          updateLegend(bar);
          lockedCrosshair.current = { time: bar.time, price: bar.close };
        }
      } else {
        updateLegendToLast();
      }
      sync.publishCrosshair(paneId, time);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartHandles, feed, crosshairLocked, paneId, sync]);

  /* ----- legend ---------------------------------------------------------- */

  function updateLegendToLast() {
    const last = feed.candles[feed.candles.length - 1];
    if (last) updateLegend(last);
  }

  function updateLegend(bar: Candle) {
    const el = legendRef.current;
    if (!el) return;
    const up = bar.close >= bar.open;
    const dirClass = up ? "var(--tk-up)" : "var(--tk-down)";
    const cells = el.querySelectorAll<HTMLSpanElement>("[data-cell]");
    const changePct = bar.open !== 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
    const values: Record<string, string> = {
      o: fmtPrice(bar.open),
      h: fmtPrice(bar.high),
      l: fmtPrice(bar.low),
      c: fmtPrice(bar.close),
      v: fmtCompact(bar.volume),
      chg: fmtPercent(changePct),
    };
    cells.forEach((cell) => {
      const key = cell.dataset["cell"];
      if (key && values[key] !== undefined) {
        cell.textContent = values[key];
        cell.style.color = dirClass;
      }
    });
  }

  /* ----- countdown to bar close ------------------------------------------ */

  useEffect(() => {
    const timer = setInterval(() => {
      const el = countdownRef.current;
      const series = seriesRef.current;
      const last = feed.candles[feed.candles.length - 1];
      if (!el || !series || !last) return;
      const closeAt = last.time + feed.barSeconds;
      const remaining = closeAt - Date.now() / 1000;
      el.textContent = fmtCountdown(remaining);
      const coord = series.priceToCoordinate(last.close);
      if (coord === null) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
        el.style.top = `${coord + 10}px`;
        el.style.background =
          last.close >= last.open ? "var(--tk-up)" : "var(--tk-down)";
      }
    }, 500);
    return () => clearInterval(timer);
  }, [feed]);

  /* ----- order / position price lines ------------------------------------ */

  const allOrders = useTrading((s) => s.orders);
  const openOrders = useMemo(
    () =>
      isPrimary
        ? allOrders.filter((o) => o.status === "open" && o.symbol === symbol)
        : EMPTY_ORDERS,
    [allOrders, isPrimary, symbol],
  );
  const position = useTrading((s) => (isPrimary ? s.positions[symbol] : undefined));

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !isPrimary) return;
    const lines: IPriceLine[] = [];
    const t = readChartTheme();
    for (const o of openOrders) {
      lines.push(
        series.createPriceLine({
          price: o.price,
          color: o.side === "buy" ? t.up : t.down,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${o.side.toUpperCase()} ${o.qty}`,
        }),
      );
    }
    if (position && position.qty !== 0) {
      lines.push(
        series.createPriceLine({
          price: position.avgPrice,
          color: t.accent,
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: `POS ${position.qty > 0 ? "+" : ""}${position.qty}`,
        }),
      );
    }
    return () => {
      for (const l of lines) series.removePriceLine(l);
    };
  }, [openOrders, position, isPrimary, chartHandles]);

  /* ----------------------------------------------------------------------- */

  return (
    <div className="relative h-full w-full bg-panel">
      <div ref={containerRef} className="absolute inset-0" />
      {/* OHLCV readout, mutated directly on crosshair move */}
      <div
        ref={legendRef}
        className="num pointer-events-none absolute left-2 top-1.5 z-20 flex items-center gap-2 text-2xs"
      >
        <span className="font-semibold text-hi">{symbol}</span>
        <LegendCell label="O" cell="o" />
        <LegendCell label="H" cell="h" />
        <LegendCell label="L" cell="l" />
        <LegendCell label="C" cell="c" />
        <LegendCell label="Vol" cell="v" />
        <span data-cell="chg" className="text-mid" />
      </div>
      <div
        ref={countdownRef}
        className="num pointer-events-none absolute right-0 z-20 hidden rounded-l-sm px-1 py-px text-2xs text-white"
      />
      {chartHandles && (
        <IndicatorPaintLayer
          chart={chartHandles.chart}
          series={chartHandles.series}
          feed={feed}
          container={containerRef}
        />
      )}
      {isPrimary && chartHandles && (
        <DrawingLayer
          chart={chartHandles.chart}
          series={chartHandles.series}
          symbol={symbol}
          feed={feed}
          container={containerRef}
        />
      )}
    </div>
  );
}

function LegendCell({ label, cell }: { label: string; cell: string }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-low">{label}</span>
      <span data-cell={cell} className="text-mid" />
    </span>
  );
}

function isOhlcType(t: ChartType): boolean {
  return t === "candles" || t === "heikin-ashi" || t === "hollow" || t === "bars";
}

function createMainSeries(chart: IChartApi, type: ChartType, t: ChartTheme): MainSeries {
  switch (type) {
    case "bars":
      return chart.addSeries(BarSeries, { upColor: t.up, downColor: t.down, thinBars: false });
    case "line":
      return chart.addSeries(LineSeries, {
        color: t.accent,
        lineWidth: 2,
        crosshairMarkerVisible: true,
      });
    case "area":
      return chart.addSeries(AreaSeries, {
        lineColor: t.accent,
        lineWidth: 2,
        topColor: withAlpha(t.accent, 0.25),
        bottomColor: withAlpha(t.accent, 0.0),
      });
    case "hollow":
      return chart.addSeries(CandlestickSeries, {
        upColor: "rgba(0,0,0,0)",
        downColor: t.down,
        borderUpColor: t.up,
        borderDownColor: t.down,
        wickUpColor: t.up,
        wickDownColor: t.down,
      });
    case "candles":
    case "heikin-ashi":
      return chart.addSeries(CandlestickSeries, {
        upColor: t.up,
        downColor: t.down,
        borderUpColor: t.up,
        borderDownColor: t.down,
        wickUpColor: t.up,
        wickDownColor: t.down,
      });
  }
}

function applyMainSeriesTheme(series: MainSeries | null, type: ChartType, t: ChartTheme) {
  if (!series) return;
  switch (type) {
    case "bars":
      series.applyOptions({ upColor: t.up, downColor: t.down });
      break;
    case "line":
      series.applyOptions({ color: t.accent });
      break;
    case "area":
      series.applyOptions({
        lineColor: t.accent,
        topColor: withAlpha(t.accent, 0.25),
        bottomColor: withAlpha(t.accent, 0),
      });
      break;
    case "hollow":
      series.applyOptions({
        downColor: t.down,
        borderUpColor: t.up,
        borderDownColor: t.down,
        wickUpColor: t.up,
        wickDownColor: t.down,
      });
      break;
    default:
      series.applyOptions({
        upColor: t.up,
        downColor: t.down,
        borderUpColor: t.up,
        borderDownColor: t.down,
        wickUpColor: t.up,
        wickDownColor: t.down,
      });
  }
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function findCandle(candles: Candle[], time: number): Candle | null {
  // binary search: candles are ascending by time
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = candles[mid]!;
    if (c.time === time) return c;
    if (c.time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
