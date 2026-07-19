"use client";

import {
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { PaneSyncApi } from "@/lib/terminal-app/components/chart/ChartWorkspace";
import type { CandleFeed } from "@/lib/terminal-app/lib/chart/feed";
import { readChartTheme } from "@/lib/terminal-app/lib/chart/theme";
import { INDICATORS, instanceLabel } from "@/lib/terminal-app/lib/indicators/registry";
import { fmtPrice } from "@/lib/terminal-app/lib/format";
import { useIndicators } from "@/lib/terminal-app/stores/indicators";
import { useSettings } from "@/lib/terminal-app/stores/settings";

function ts(t: number): UTCTimestamp {
  return t as UTCTimestamp;
}

/**
 * One oscillator pane: its own lightweight-charts instance, time-synced with
 * the main pane through the workspace sync bus.
 */
export function SubPane({
  instanceId,
  feed,
  sync,
}: {
  instanceId: string;
  feed: CandleFeed;
  sync: PaneSyncApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const valuesRef = useRef<HTMLSpanElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>>(new Map());
  const applyingRange = useRef(false);
  const lastCompute = useRef(0);
  const theme = useSettings((s) => s.theme);

  const inst = useIndicators((s) => s.instances.find((i) => i.id === instanceId));
  const remove = useIndicators((s) => s.remove);

  /* chart lifecycle */
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
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
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
        visible: true,
      },
      rightPriceScale: { borderColor: t.border },
      localization: { priceFormatter: (p: number) => fmtPrice(p) },
    });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      seriesRef.current.clear();
      chart.remove();
    };
  }, []);

  /* theme */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    requestAnimationFrame(() => {
      const t = readChartTheme();
      chart.applyOptions({
        layout: { textColor: t.text },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
        timeScale: { borderColor: t.border },
        rightPriceScale: { borderColor: t.border },
      });
    });
  }, [theme]);

  /* data + series */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !inst) return;
    const def = INDICATORS[inst.type];

    const rebuild = () => {
      for (const s of seriesRef.current.values()) chart.removeSeries(s);
      seriesRef.current.clear();
      for (const line of def.lines) {
        const color = inst.colors[line.key] ?? line.defaultColor;
        const width = (inst.widths[line.key] ?? line.defaultWidth) as 1 | 2 | 3 | 4;
        const s =
          line.style === "histogram"
            ? chart.addSeries(HistogramSeries, {
                priceLineVisible: false,
                lastValueVisible: false,
              })
            : chart.addSeries(LineSeries, {
                color,
                lineWidth: width,
                priceLineVisible: false,
                lastValueVisible: true,
                crosshairMarkerVisible: false,
              });
        seriesRef.current.set(line.key, s);
      }
      // level guides (RSI 30/70, MACD 0, ...)
      const first = seriesRef.current.get(def.lines[def.lines.length - 1]!.key);
      if (first && def.levels) {
        const t = readChartTheme();
        for (const level of def.levels) {
          first.createPriceLine({
            price: level,
            color: t.grid,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: "",
          });
        }
      }
      compute();
    };

    const compute = () => {
      if (feed.candles.length === 0) return;
      const t = readChartTheme();
      const results = def.compute(feed.candles, inst.params);
      for (const line of def.lines) {
        const s = seriesRef.current.get(line.key);
        if (!s) continue;
        const pts = results[line.key] ?? [];
        if (line.style === "histogram") {
          s.setData(
            pts.map((p) => ({
              time: ts(p.time),
              value: p.value,
              color: p.value >= 0 ? t.upMuted : t.downMuted,
            })),
          );
        } else {
          s.setData(pts.map((p) => ({ time: ts(p.time), value: p.value })));
        }
      }
      const el = valuesRef.current;
      if (el) {
        const tail = def.lines
          .map((l) => {
            const pts = results[l.key] ?? [];
            const last = pts[pts.length - 1];
            return last ? fmtPrice(last.value) : "—";
          })
          .join("  ");
        el.textContent = tail;
      }
    };

    rebuild();
    const unsub = feed.subscribe((event) => {
      if (event === "history") compute();
      else {
        const now = performance.now();
        if (now - lastCompute.current > 300) {
          lastCompute.current = now;
          requestAnimationFrame(compute);
        }
      }
    });
    return unsub;
  }, [inst, feed]);

  /* time-scale + crosshair sync */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const onRange = (range: LogicalRange | null) => {
      if (!range || applyingRange.current) return;
      sync.publishRange(instanceId, range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    const onMove = (param: MouseEventParams) => {
      const time = typeof param.time === "number" ? param.time : null;
      sync.publishCrosshair(instanceId, time);
    };
    chart.subscribeCrosshairMove(onMove);

    const unregister = sync.register(instanceId, {
      applyRange: (range) => {
        applyingRange.current = true;
        chart.timeScale().setVisibleLogicalRange(range);
        applyingRange.current = false;
      },
      applyCrosshair: (time) => {
        const series = [...seriesRef.current.values()][seriesRef.current.size - 1];
        if (time === null || !series) {
          chart.clearCrosshairPosition();
          return;
        }
        chart.setCrosshairPosition(0, ts(time), series);
      },
    });

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onMove);
      unregister();
    };
  }, [instanceId, sync]);

  if (!inst) return null;
  const def = INDICATORS[inst.type];

  return (
    <div className="relative h-full w-full border-t border-edge bg-panel">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="num pointer-events-none absolute left-2 top-1 z-20 flex items-center gap-2 text-2xs">
        <span className="text-hi">{instanceLabel(inst.type, inst.params)}</span>
        <span ref={valuesRef} className="text-mid" />
        <button
          type="button"
          title={`Remove ${def.shortLabel}`}
          className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded text-low transition-colors duration-100 hover:bg-hover hover:text-down"
          onClick={() => remove(inst.id)}
        >
          <svg width="8" height="8" viewBox="0 0 10 10">
            <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
