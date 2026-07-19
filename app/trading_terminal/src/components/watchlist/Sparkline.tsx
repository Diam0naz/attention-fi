"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useProvider } from "@/lib/providers";

/**
 * 1h-resolution mini price line for a watchlist row, drawn on a small canvas.
 * History is cached for five minutes; the canvas redraws only when data or
 * theme changes.
 */
export function Sparkline({ symbol, up }: { symbol: string; up: boolean }) {
  const provider = useProvider();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { data } = useQuery({
    queryKey: ["sparkline", provider.name, symbol],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const candles = await provider.getCandles(symbol, "1h", now - 24 * 3600, now);
      return candles.map((c) => c.close);
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 56;
    const h = 16;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const color = up ? "var(--tk-up)" : "var(--tk-down)";
    const resolved = getComputedStyle(canvas).getPropertyValue(up ? "--tk-up" : "--tk-down").trim() || color;
    ctx.strokeStyle = resolved;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((data[i]! - min) / range) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, up]);

  return <canvas ref={canvasRef} style={{ width: 56, height: 16 }} />;
}
