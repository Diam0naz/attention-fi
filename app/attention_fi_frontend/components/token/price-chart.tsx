"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChartSeries, type Candle, type Volume } from "@/lib/mock-data";
import { SOL_USD } from "@/lib/solana/token-data";

// Fixed total supply (whole tokens) — real snapshots store SOL/token, so
// price → market-cap-USD via price × supply × SOL/USD keeps the real series on
// the same scale the chart (and the header market cap) already use.
const TOTAL_SUPPLY_WHOLE = 1_000_000_000;

interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Convert real SOL-priced OHLCV candles to the market-cap-USD chart series. */
function toSeries(rows: ApiCandle[]): { candles: Candle[]; volumes: Volume[] } {
  const k = TOTAL_SUPPLY_WHOLE * SOL_USD;
  const candles = rows.map((c) => ({
    time: c.time,
    open: c.open * k,
    high: c.high * k,
    low: c.low * k,
    close: c.close * k,
  }));
  const volumes = rows.map((c) => ({
    time: c.time,
    value: c.volume * SOL_USD,
    color: c.close >= c.open ? "rgba(0,255,133,0.5)" : "rgba(255,59,92,0.5)",
  }));
  return { candles, volumes };
}

const TIMEFRAMES = [
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "15m", sec: 900 },
  { label: "1H", sec: 3600 },
  { label: "4H", sec: 14_400 },
  { label: "1D", sec: 86_400 },
];

const SIGNAL = "#00ff85";
const NOISE = "#ff3b5c";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

/** Simple moving average; leading values are null until the period fills. */
function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

interface Legend {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Trading chart with exchange basics: timeframes, candle/line, MA, volume, zoom. */
export function PriceChart({
  handle,
  marketCap,
  mint,
}: {
  handle: string;
  marketCap: number;
  mint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [tfSec, setTfSec] = useState(3600);
  const [type, setType] = useState<"candles" | "line">("candles");
  const [showMA, setShowMA] = useState(true);
  const [showVol, setShowVol] = useState(true);
  const [legend, setLegend] = useState<Legend | null>(null);
  // Real OHLCV from the price-history store, once loaded. Null → use synthetic.
  const [real, setReal] = useState<{ candles: Candle[]; volumes: Volume[] } | null>(null);

  const synthetic = useMemo(
    () => getChartSeries(handle, marketCap, tfSec),
    [handle, marketCap, tfSec],
  );

  // Pull real history for this mint + timeframe; fall back to synthetic when the
  // store has nothing yet (fewer than 2 candles) or the token isn't on-chain.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!mint) {
        if (!cancelled) setReal(null);
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const from = now - tfSec * 240;
      try {
        const r = await fetch(`/api/market/candles?mint=${mint}&tf=${tfSec}&from=${from}&to=${now}`);
        const j = (r.ok ? await r.json() : { candles: [] }) as { candles?: ApiCandle[] };
        if (cancelled) return;
        const rows = j.candles ?? [];
        setReal(rows.length >= 2 ? toSeries(rows) : null);
      } catch {
        if (!cancelled) setReal(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mint, tfSec]);

  const { candles, volumes } = real ?? synthetic;

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
        vertLine: { color: "rgba(0,255,133,0.35)", labelBackgroundColor: SIGNAL },
        horzLine: { color: "rgba(0,255,133,0.35)", labelBackgroundColor: SIGNAL },
      },
      // Don't hijack the wheel — the page scrolls normally over the chart and
      // zoom is driven by the toolbar buttons / pinch instead.
      handleScale: { mouseWheel: false, axisPressedMouseMove: true, pinch: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    chartRef.current = chart;

    const times = candles.map((c) => c.time as UTCTimestamp);
    const closes = candles.map((c) => c.close);

    if (type === "candles") {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: SIGNAL,
        downColor: NOISE,
        wickUpColor: SIGNAL,
        wickDownColor: NOISE,
        borderVisible: false,
        priceFormat: { type: "price", precision: 0, minMove: 1 },
      });
      s.setData(
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
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor: SIGNAL,
        topColor: "rgba(0,255,133,0.28)",
        bottomColor: "rgba(0,255,133,0)",
        lineWidth: 2,
        priceFormat: { type: "price", precision: 0, minMove: 1 },
      });
      s.setData(candles.map((c): LineData => ({ time: c.time as UTCTimestamp, value: c.close })));
    }

    if (showMA) {
      for (const spec of [
        { period: 7, color: "#5b8fff" },
        { period: 25, color: "#f5b300" },
      ]) {
        const line = chart.addSeries(LineSeries, {
          color: spec.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const vals = sma(closes, spec.period);
        const data: LineData[] = [];
        for (let i = 0; i < vals.length; i++) {
          const v = vals[i];
          if (v != null) data.push({ time: times[i]!, value: v });
        }
        line.setData(data);
      }
    }

    if (showVol) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volSeries.setData(
        volumes.map((v): HistogramData => ({ time: v.time as UTCTimestamp, value: v.value, color: v.color })),
      );
    }

    // OHLC readout follows the crosshair, defaulting to the latest candle.
    const last = candles[candles.length - 1];
    const lastVol = volumes[volumes.length - 1];
    const resetLegend = () => {
      if (last && lastVol) setLegend({ o: last.open, h: last.high, l: last.low, c: last.close, v: lastVol.value });
    };
    resetLegend();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) return resetLegend();
      const i = times.indexOf(param.time as UTCTimestamp);
      const c = candles[i];
      const v = volumes[i];
      if (c && v) setLegend({ o: c.open, h: c.high, l: c.low, c: c.close, v: v.value });
    });

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, volumes, type, showMA, showVol]);

  function zoom(factor: number) {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const current = ts.options().barSpacing ?? 6;
    ts.applyOptions({ barSpacing: Math.min(60, Math.max(1.5, current * factor)) });
  }

  const up = legend ? legend.c >= legend.o : true;

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0b1017] px-2.5 py-2">
        <div className="flex overflow-hidden rounded-sm border border-white/10">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.label}
              onClick={() => setTfSec(t.sec)}
              className={cn(
                "px-2 py-1 font-mono text-[10px] font-bold transition-colors",
                tfSec === t.sec ? "bg-signal text-[#0A0A0A]" : "text-[#6B6B6B] hover:text-[#F5F4F0]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-sm border border-white/10">
          {(["candles", "line"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setType(v)}
              className={cn(
                "px-2 py-1 font-mono text-[10px] font-bold uppercase transition-colors",
                type === v ? "bg-white/10 text-[#F5F4F0]" : "text-[#6B6B6B] hover:text-[#F5F4F0]",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowMA((s) => !s)}
          className={cn(
            "rounded-sm border px-2 py-1 font-mono text-[10px] font-bold transition-colors",
            showMA ? "border-pulse/50 text-pulse" : "border-white/10 text-[#6B6B6B]",
          )}
        >
          MA
        </button>
        <button
          onClick={() => setShowVol((s) => !s)}
          className={cn(
            "rounded-sm border px-2 py-1 font-mono text-[10px] font-bold transition-colors",
            showVol ? "border-signal/50 text-signal" : "border-white/10 text-[#6B6B6B]",
          )}
        >
          VOL
        </button>

        <div className="ml-auto flex items-center gap-1">
          <IconBtn onClick={() => zoom(1 / 1.3)} label="Zoom out">
            <Minus className="h-3 w-3" />
          </IconBtn>
          <IconBtn onClick={() => zoom(1.3)} label="Zoom in">
            <Plus className="h-3 w-3" />
          </IconBtn>
          <IconBtn onClick={() => chartRef.current?.timeScale().fitContent()} label="Fit">
            <Maximize2 className="h-3 w-3" />
          </IconBtn>
        </div>
      </div>

      {/* OHLC readout */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 bg-black px-3 pt-2 font-mono text-[10px]">
        <span className="text-[#6B6B6B]">
          @{handle} · {TIMEFRAMES.find((t) => t.sec === tfSec)?.label}
        </span>
        {legend && (
          <>
            {(
              [
                ["O", legend.o],
                ["H", legend.h],
                ["L", legend.l],
                ["C", legend.c],
              ] as const
            ).map(([k, val]) => (
              <span key={k} className="text-[#6B6B6B]">
                {k} <span className={up ? "text-signal" : "text-noise"}>{usd(val)}</span>
              </span>
            ))}
            <span className="text-[#6B6B6B]">
              Vol <span className="text-[#9aa4af]">{usd(legend.v)}</span>
            </span>
          </>
        )}
        {showMA && (
          <span className="ml-auto flex gap-2">
            <span className="text-pulse">MA7</span>
            <span className="text-[#f5b300]">MA25</span>
          </span>
        )}
      </div>

      <div ref={ref} className="h-[320px] w-full touch-pan-y sm:h-[380px]" />
    </div>
  );
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-sm border border-white/10 p-1 text-[#9aa4af] transition-colors hover:border-white/25 hover:text-[#F5F4F0]"
    >
      {children}
    </button>
  );
}
