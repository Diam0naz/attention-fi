"use client";

import type { IChartApi, ISeriesApi, Logical, SeriesType } from "lightweight-charts";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { CandleFeed } from "@/lib/terminal-app/lib/chart/feed";
import { INDICATORS } from "@/lib/terminal-app/lib/indicators/registry";
import type { LinePoint } from "@/lib/terminal-app/lib/indicators/compute";
import { useIndicators } from "@/lib/terminal-app/stores/indicators";

/**
 * Passive canvas over the chart for indicator visuals lightweight-charts v4
 * can't express as series: the Ichimoku cloud fill (region between Senkou A
 * and B, tinted by which is on top) and Parabolic SAR dots. Repaints on
 * range/data/settings changes; never intercepts pointer events.
 */
export function IndicatorPaintLayer({
  chart,
  series,
  feed,
  container,
}: {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  feed: CandleFeed;
  container: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const lastCompute = useRef(0);
  const instances = useIndicators((s) => s.instances);

  // Not useCallback: the React Compiler refuses to compile a component whose
  // manual memoization it can't prove equivalent, and bails on the whole file.
  // Letting it memoize this itself is both the intended remedy and strictly
  // better — it tracks the real dependencies rather than the hand-written list.
  const paint = () => {
    const canvas = canvasRef.current;
    const el = container.current;
    const first = feed.candles[0];
    if (!canvas || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!first) return;

    const active = useIndicators
      .getState()
      .instances.filter(
        (i) =>
          i.visible &&
          INDICATORS[i.type].pane === "overlay" &&
          (INDICATORS[i.type].band !== undefined ||
            INDICATORS[i.type].lines.some((l) => l.style === "points")),
      );
    if (active.length === 0) return;

    const bar = feed.barSeconds;
    const timeToX = (time: number): number | null =>
      chart.timeScale().logicalToCoordinate(((time - first.time) / bar) as Logical);
    const priceToY = (price: number): number | null => series.priceToCoordinate(price);

    const plotW = w - chart.priceScale("right").width();
    const plotH = h - chart.timeScale().height();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotW, plotH);
    ctx.clip();

    const barSpacing =
      (chart.timeScale().options() as { barSpacing?: number }).barSpacing ?? 7;

    for (const inst of active) {
      const def = INDICATORS[inst.type];
      const results = def.compute(feed.candles, inst.params);

      if (def.band) {
        drawCloud(
          ctx,
          results[def.band.upper] ?? [],
          results[def.band.lower] ?? [],
          timeToX,
          priceToY,
          inst.colors[def.band.upper] ?? "#2ebd85",
          inst.colors[def.band.lower] ?? "#e5484d",
        );
      }

      for (const line of def.lines) {
        if (line.style !== "points") continue;
        const pts = results[line.key] ?? [];
        const color = inst.colors[line.key] ?? line.defaultColor;
        const radius = Math.max(1, Math.min(2.5, barSpacing * 0.22));
        ctx.fillStyle = color;
        for (const p of pts) {
          if (!Number.isFinite(p.value)) continue;
          const x = timeToX(p.time);
          if (x === null || x < -4 || x > plotW + 4) continue;
          const y = priceToY(p.value);
          if (y === null) continue;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  };

  // Same arrangement as DrawingLayer's scheduleDraw. The compiler isn't enabled
  // in next.config, so a plain `schedule` was a new function every render, and
  // the effects below re-subscribed (and cancelled the pending frame) on every
  // render. A stable schedule reads the current paint through a ref instead,
  // assigned after commit; it's only dereferenced inside a rAF callback.
  const paintRef = useRef<() => void>(() => {});
  useEffect(() => {
    paintRef.current = paint;
  });
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paintRef.current();
    });
  }, []);

  // Repaint when anything paint reads changes, including a recreated series.
  useEffect(() => {
    schedule();
  }, [instances, chart, series, feed, schedule]);

  useEffect(() => {
    const onRange = () => schedule();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const unsubFeed = feed.subscribe((event) => {
      if (event === "history") schedule();
      else {
        // compute is O(n·period); cap live repaints
        const now = performance.now();
        if (now - lastCompute.current > 300) {
          lastCompute.current = now;
          schedule();
        }
      }
    });
    const ro = new ResizeObserver(() => schedule());
    if (container.current) ro.observe(container.current);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      unsubFeed();
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [chart, feed, schedule, container]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[5]" />;
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Fill between two displaced lines. Points are aligned by timestamp; runs are
 * split where the sign of (upper − lower) flips so bull and bear cloud
 * segments get their own tint.
 */
function drawCloud(
  ctx: CanvasRenderingContext2D,
  upper: LinePoint[],
  lower: LinePoint[],
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  bullColor: string,
  bearColor: string,
) {
  if (upper.length === 0 || lower.length === 0) return;
  const lowerByTime = new Map<number, number>();
  for (const p of lower) {
    if (Number.isFinite(p.value)) lowerByTime.set(p.time, p.value);
  }

  interface CloudPt {
    xA: number;
    yA: number;
    yB: number;
    bull: boolean;
  }
  const aligned: CloudPt[] = [];
  for (const p of upper) {
    if (!Number.isFinite(p.value)) continue;
    const b = lowerByTime.get(p.time);
    if (b === undefined) continue;
    const x = timeToX(p.time);
    const yA = priceToY(p.value);
    const yB = priceToY(b);
    if (x === null || yA === null || yB === null) continue;
    aligned.push({ xA: x, yA, yB, bull: p.value >= b });
  }
  if (aligned.length < 2) return;

  let runStart = 0;
  for (let i = 1; i <= aligned.length; i++) {
    const boundary = i === aligned.length || aligned[i]!.bull !== aligned[runStart]!.bull;
    if (!boundary) continue;
    const run = aligned.slice(runStart, i);
    // include the crossover point by extending one sample into the next run
    if (i < aligned.length) run.push(aligned[i]!);
    if (run.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(run[0]!.xA, run[0]!.yA);
      for (let j = 1; j < run.length; j++) ctx.lineTo(run[j]!.xA, run[j]!.yA);
      for (let j = run.length - 1; j >= 0; j--) ctx.lineTo(run[j]!.xA, run[j]!.yB);
      ctx.closePath();
      ctx.fillStyle = withAlpha(aligned[runStart]!.bull ? bullColor : bearColor, 0.09);
      ctx.fill();
    }
    runStart = i;
  }
}
