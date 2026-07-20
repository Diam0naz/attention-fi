"use client";

import type {
  IChartApi,
  ISeriesApi,
  Logical,
  SeriesType,
} from "lightweight-charts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  extendRay,
  FIB_EXTENSION_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  hitTest,
  toPt,
  type CoordSpace,
  type Hit,
  type Pt,
} from "@/lib/terminal-app/components/chart/drawingGeometry";
import { ColorSwatches } from "@/lib/terminal-app/components/ui/ColorSwatches";
import { Select } from "@/lib/terminal-app/components/ui/Select";
import type { CandleFeed } from "@/lib/terminal-app/lib/chart/feed";
import { fmtCountdown, fmtPercent, fmtPrice } from "@/lib/terminal-app/lib/format";
import {
  DEFAULT_STYLE,
  drawingId,
  POINTS_REQUIRED,
  useDrawings,
  type DashStyle,
  type Drawing,
  type DrawingPoint,
  type DrawingTool,
} from "@/lib/terminal-app/stores/drawings";

const EMPTY: Drawing[] = [];

interface DraftState {
  tool: DrawingTool;
  points: DrawingPoint[];
  preview: DrawingPoint | null;
}

interface DragState {
  id: string;
  handleIndex: number | null; // null = body drag
  origin: Pt;
  originPoints: DrawingPoint[];
  historyPushed: boolean;
}

export function DrawingLayer({
  chart,
  series,
  symbol,
  feed,
  container,
}: {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  symbol: string;
  feed: CandleFeed;
  container: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawings = useDrawings((s) => s.bySymbol[symbol] ?? EMPTY);
  const activeTool = useDrawings((s) => s.activeTool);
  const selectedId = useDrawings((s) => s.selectedId);

  const draftRef = useRef<DraftState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const hoverRef = useRef<Hit | null>(null);
  const rafRef = useRef(0);
  const [textEditId, setTextEditId] = useState<string | null>(null);

  /* ----- coordinate space ------------------------------------------------ */

  const makeSpace = useCallback((): CoordSpace | null => {
    const el = container.current;
    const first = feed.candles[0];
    if (!el || !first) return null;
    const axisW = chart.priceScale("right").width();
    const axisH = chart.timeScale().height();
    const width = el.clientWidth - axisW;
    const height = el.clientHeight - axisH;
    const bar = feed.barSeconds;
    return {
      width,
      height,
      timeToX: (time) =>
        chart.timeScale().logicalToCoordinate(((time - first.time) / bar) as Logical),
      xToTime: (x) => {
        const logical = chart.timeScale().coordinateToLogical(x);
        if (logical === null) return null;
        return first.time + Math.round(logical as number) * bar;
      },
      priceToY: (price) => series.priceToCoordinate(price),
      yToPrice: (y) => series.coordinateToPrice(y),
    };
  }, [chart, series, feed, container]);

  /* ----- painting -------------------------------------------------------- */

  // paint captures chart/series/feed from the current render; route rAF
  // through a ref so a stable scheduleDraw never pins a stale closure
  // (the series is recreated on chart-type/timeframe changes).
  const paintRef = useRef<() => void>(() => {});
  paintRef.current = paint;
  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paintRef.current();
    });
  }, []);

  function paint() {
    const canvas = canvasRef.current;
    const el = container.current;
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
    const space = makeSpace();
    if (!space) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, space.width, space.height);
    ctx.clip();

    const state = useDrawings.getState();
    const list = state.bySymbol[symbol] ?? EMPTY;
    for (const d of list) {
      renderDrawing(ctx, space, d, d.id === state.selectedId);
    }
    const draft = draftRef.current;
    if (draft && draft.points.length > 0) {
      const preview: Drawing = {
        id: "draft",
        tool: draft.tool,
        symbol,
        points:
          draft.preview && draft.points.length < POINTS_REQUIRED[draft.tool]
            ? [...draft.points, draft.preview]
            : draft.points,
        style: DEFAULT_STYLE,
      };
      renderDrawing(ctx, space, preview, true);
    }
    ctx.restore();
  }

  /* repaint triggers — including when the underlying series is recreated */
  useEffect(() => {
    scheduleDraw();
  }, [drawings, selectedId, activeTool, chart, series, scheduleDraw]);

  useEffect(() => {
    const onRange = () => scheduleDraw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const unsubFeed = feed.subscribe(() => scheduleDraw());
    const ro = new ResizeObserver(() => scheduleDraw());
    if (container.current) ro.observe(container.current);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      unsubFeed();
      ro.disconnect();
    };
  }, [chart, feed, scheduleDraw, container]);

  /* ----- pointer interaction --------------------------------------------- */

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const localPoint = (e: PointerEvent): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const pointFromPt = (space: CoordSpace, p: Pt): DrawingPoint | null => {
      const time = space.xToTime(p.x);
      const price = space.yToPrice(p.y);
      if (time === null || price === null) return null;
      return { time, price: price as number };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const space = makeSpace();
      if (!space) return;
      const p = localPoint(e);
      if (p.x > space.width || p.y > space.height) return; // axis area

      const store = useDrawings.getState();
      const tool = store.activeTool;

      if (tool) {
        e.preventDefault();
        e.stopPropagation();
        const dp = pointFromPt(space, p);
        if (!dp) return;
        const draft = draftRef.current ?? { tool, points: [], preview: null };
        draft.tool = tool;
        draft.points.push(dp);
        draftRef.current = draft;
        if (draft.points.length >= POINTS_REQUIRED[tool]) {
          const id = drawingId();
          store.addDrawing({
            id,
            tool,
            symbol,
            points: draft.points,
            style: { ...DEFAULT_STYLE },
            text: tool === "text" ? "" : undefined,
          });
          draftRef.current = null;
          if (tool === "text") setTextEditId(id);
        }
        scheduleDraw();
        return;
      }

      const list = store.bySymbol[symbol] ?? EMPTY;
      const hit = hitTest(space, list, p);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        store.select(hit.drawing.id);
        dragRef.current = {
          id: hit.drawing.id,
          handleIndex: hit.region.kind === "handle" ? hit.region.index : null,
          origin: p,
          originPoints: hit.drawing.points.map((pt) => ({ ...pt })),
          historyPushed: false,
        };
        el.setPointerCapture(e.pointerId);
      } else if (store.selectedId) {
        store.select(null);
      }
    };

    const onMove = (e: PointerEvent) => {
      const space = makeSpace();
      if (!space) return;
      const p = localPoint(e);
      const drag = dragRef.current;

      if (drag) {
        e.preventDefault();
        e.stopPropagation();
        const store = useDrawings.getState();
        if (!drag.historyPushed) {
          store.pushHistory(symbol);
          drag.historyPushed = true;
        }
        const dTimePx = p.x - drag.origin.x;
        const dPricePx = p.y - drag.origin.y;
        const anchor = drag.originPoints[0]!;
        const anchorPt = toPt(space, anchor);
        if (!anchorPt) return;
        const moved = pointFromPt(space, {
          x: anchorPt.x + dTimePx,
          y: anchorPt.y + dPricePx,
        });
        if (!moved) return;
        const dTime = moved.time - anchor.time;
        const dPrice = moved.price - anchor.price;

        if (drag.handleIndex === null) {
          const points = drag.originPoints.map((pt) => ({
            time: pt.time + dTime,
            price: pt.price + dPrice,
          }));
          store.updateDrawingLive(symbol, drag.id, { points });
        } else {
          const dp = pointFromPt(space, p);
          if (!dp) return;
          const points = drag.originPoints.map((pt) => ({ ...pt }));
          const idx = Math.min(drag.handleIndex, points.length - 1);
          points[idx] = dp;
          store.updateDrawingLive(symbol, drag.id, { points });
        }
        scheduleDraw();
        return;
      }

      const draft = draftRef.current;
      if (draft) {
        draft.preview = pointFromPt(space, p);
        scheduleDraw();
        return;
      }

      // hover cursor
      const store = useDrawings.getState();
      if (store.activeTool) {
        el.style.cursor = "crosshair";
        return;
      }
      const hit = hitTest(space, store.bySymbol[symbol] ?? EMPTY, p);
      hoverRef.current = hit;
      el.style.cursor = hit
        ? hit.region.kind === "handle"
          ? "grab"
          : "move"
        : "";
    };

    const onUp = (e: PointerEvent) => {
      if (dragRef.current) {
        e.stopPropagation();
        dragRef.current = null;
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const space = makeSpace();
      if (!space) return;
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const store = useDrawings.getState();
      const hit = hitTest(space, store.bySymbol[symbol] ?? EMPTY, p);
      if (hit && hit.drawing.tool === "text") {
        e.preventDefault();
        e.stopPropagation();
        setTextEditId(hit.drawing.id);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && draftRef.current) {
        draftRef.current = null;
        scheduleDraw();
      }
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("dblclick", onDblClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("dblclick", onDblClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [container, makeSpace, symbol, scheduleDraw]);

  /* clear any in-progress draft when the tool changes */
  useEffect(() => {
    draftRef.current = activeTool ? { tool: activeTool, points: [], preview: null } : null;
    scheduleDraw();
  }, [activeTool, scheduleDraw]);

  /* ----- selected drawing toolbar ---------------------------------------- */

  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const updateDrawing = useDrawings((s) => s.updateDrawing);
  const deleteDrawing = useDrawings((s) => s.deleteDrawing);

  /* ----- text editing ----------------------------------------------------- */

  const editing = drawings.find((d) => d.id === textEditId) ?? null;
  const editingPos = (() => {
    if (!editing) return null;
    const space = makeSpace();
    if (!space) return null;
    const pt = toPt(space, editing.points[0]!);
    return pt;
  })();

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" />
      {selected && !editing && (
        <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-edge-strong bg-overlay px-2 py-1 shadow-lg">
          <span className="text-2xs uppercase tracking-wide text-low">{selected.tool}</span>
          <ColorSwatches
            value={selected.style.color}
            onChange={(color) =>
              updateDrawing(symbol, selected.id, { style: { ...selected.style, color } })
            }
          />
          <Select
            value={String(selected.style.width)}
            options={["1", "2", "3", "4"].map((w) => ({ value: w, label: `${w}px` }))}
            onChange={(w) =>
              updateDrawing(symbol, selected.id, {
                style: { ...selected.style, width: parseInt(w, 10) },
              })
            }
            buttonClassName="h-5"
          />
          <Select
            value={selected.style.dash}
            options={[
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
            ]}
            onChange={(dash) =>
              updateDrawing(symbol, selected.id, {
                style: { ...selected.style, dash: dash as DashStyle },
              })
            }
            buttonClassName="h-5"
          />
          <button
            type="button"
            title="Delete drawing"
            className="flex h-5 w-5 items-center justify-center rounded text-mid transition-colors duration-100 hover:bg-hover hover:text-down"
            onClick={() => deleteDrawing(symbol, selected.id)}
          >
            <svg width="9" height="9" viewBox="0 0 10 10">
              <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
      {editing && editingPos && (
        <input
          autoFocus
          defaultValue={editing.text ?? ""}
          style={{ position: "absolute", left: editingPos.x, top: editingPos.y - 10 }}
          className="z-30 w-40 rounded border border-focus bg-overlay px-1 py-0.5 text-xs text-hi outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) updateDrawing(symbol, editing.id, { text: value });
              else deleteDrawing(symbol, editing.id);
              setTextEditId(null);
            } else if (e.key === "Escape") {
              if (!editing.text) deleteDrawing(symbol, editing.id);
              setTextEditId(null);
            }
            e.stopPropagation();
          }}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value) updateDrawing(symbol, editing.id, { text: value });
            else deleteDrawing(symbol, editing.id);
            setTextEditId(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* rendering                                                                  */
/* ------------------------------------------------------------------------- */

function dashPattern(dash: DashStyle): number[] {
  if (dash === "dashed") return [6, 4];
  if (dash === "dotted") return [2, 3];
  return [];
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function renderDrawing(
  ctx: CanvasRenderingContext2D,
  space: CoordSpace,
  d: Drawing,
  selected: boolean,
) {
  const pts = d.points.map((p) => toPt(space, p));
  const { color, width, dash, fillOpacity } = d.style;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashPattern(dash));
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';

  const [a, b, c] = pts;
  switch (d.tool) {
    case "trendline":
      if (a && b) line(ctx, a, b);
      break;
    case "ray":
      if (a && b) line(ctx, a, extendRay(a, b, space.width, space.height));
      break;
    case "hline": {
      const y = a?.y;
      if (y !== undefined && y !== null) {
        line(ctx, { x: 0, y }, { x: space.width, y });
        ctx.fillStyle = color;
        ctx.fillText(fmtPrice(d.points[0]!.price), 6, y - 4);
      }
      break;
    }
    case "vline": {
      const x = a?.x;
      if (x !== undefined && x !== null) line(ctx, { x, y: 0 }, { x, y: space.height });
      break;
    }
    case "rect":
      if (a && b) {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.fillStyle = withAlpha(color, fillOpacity);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
      break;
    case "fib-retracement":
      if (a && b) {
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const p0 = d.points[0]!.price;
        const p1 = d.points[1]!.price;
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.6;
        line(ctx, a, b);
        ctx.globalAlpha = 1;
        ctx.setLineDash(dashPattern(dash));
        for (let i = 0; i < FIB_RETRACEMENT_LEVELS.length; i++) {
          const level = FIB_RETRACEMENT_LEVELS[i]!;
          const price = p0 + (p1 - p0) * level;
          const y = space.priceToY(price);
          if (y === null) continue;
          if (i > 0) {
            const prevPrice = p0 + (p1 - p0) * FIB_RETRACEMENT_LEVELS[i - 1]!;
            const py = space.priceToY(prevPrice);
            if (py !== null) {
              ctx.fillStyle = withAlpha(color, 0.05);
              ctx.fillRect(x0, Math.min(y, py), x1 - x0, Math.abs(y - py));
            }
          }
          line(ctx, { x: x0, y }, { x: x1, y });
          ctx.fillStyle = color;
          ctx.fillText(`${level}  ${fmtPrice(price)}`, x1 + 6, y + 3);
        }
      }
      break;
    case "fib-extension":
      if (a && b && c) {
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.6;
        line(ctx, a, b);
        line(ctx, b, c);
        ctx.globalAlpha = 1;
        ctx.setLineDash(dashPattern(dash));
        const span = d.points[1]!.price - d.points[0]!.price;
        const base = d.points[2]!.price;
        for (const level of FIB_EXTENSION_LEVELS) {
          const price = base + span * level;
          const y = space.priceToY(price);
          if (y === null) continue;
          line(ctx, { x: c.x, y }, { x: space.width, y });
          ctx.fillStyle = color;
          ctx.fillText(`${level}  ${fmtPrice(price)}`, c.x + 4, y - 3);
        }
      }
      break;
    case "text":
      if (a) {
        ctx.fillStyle = color;
        ctx.font = '11px "Inter Tight", system-ui, sans-serif';
        ctx.fillText(d.text || "…", a.x, a.y);
      }
      break;
    case "measure":
      if (a && b) {
        const p0 = d.points[0]!;
        const p1 = d.points[1]!;
        const up = p1.price >= p0.price;
        const boxColor = up ? "#2ebd85" : "#e5484d";
        ctx.fillStyle = withAlpha(boxColor, 0.1);
        ctx.strokeStyle = boxColor;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        const dPrice = p1.price - p0.price;
        const pct = p0.price !== 0 ? (dPrice / p0.price) * 100 : 0;
        const bars = Math.round(Math.abs(p1.time - p0.time) / Math.max(1, barSecondsOf(d)));
        const label = `${dPrice >= 0 ? "+" : ""}${fmtPrice(dPrice)}  (${fmtPercent(pct)})  ${bars} bars  ${fmtCountdown(Math.abs(p1.time - p0.time))}`;
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        const tw = ctx.measureText(label).width;
        const lx = (a.x + b.x) / 2 - tw / 2 - 5;
        const ly = y - 20;
        ctx.fillStyle = boxColor;
        ctx.fillRect(lx, ly, tw + 10, 15);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, lx + 5, ly + 11);
      }
      break;
  }

  if (selected) {
    for (const p of pts) {
      if (!p) continue;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

/**
 * Measure labels want a bar count; the drawing itself doesn't know its
 * timeframe, so approximate from the anchor spacing when possible.
 */
function barSecondsOf(d: Drawing): number {
  const dt = Math.abs(d.points[1]!.time - d.points[0]!.time);
  const known = [60, 300, 900, 3600, 14400, 86400, 604800];
  for (let i = known.length - 1; i >= 0; i--) {
    const k = known[i]!;
    if (dt >= k && dt % k === 0) return k;
  }
  return 60;
}

function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
