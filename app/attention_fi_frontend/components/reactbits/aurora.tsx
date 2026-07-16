"use client";

import { useEffect, useRef } from "react";

/**
 * react-bits-style "Aurora" — soft drifting gradient glows. Dependency-free
 * canvas (additive radial gradients, ~5 draws/frame), DPR-aware, reduced-motion
 * safe. Brand colors: signal green, pulse blue, noise pink.
 */
export function Aurora({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["0,255,133", "91,143,255", "255,59,92"];
    const blobs = Array.from({ length: 5 }, (_, i) => ({
      bx: 0.2 + (i / 5) * 0.6,
      by: 0.3 + Math.random() * 0.4,
      r: 0.4 + Math.random() * 0.3,
      color: colors[i % colors.length]!,
      sx: 0.00004 + Math.random() * 0.00005,
      sy: 0.00004 + Math.random() * 0.00005,
      px: Math.random() * 6.28,
      py: Math.random() * 6.28,
      amp: 0.12 + Math.random() * 0.1,
    }));

    let w = 0;
    let h = 0;
    let raf = 0;
    const resize = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const cx = (b.bx + Math.sin(time * b.sx + b.px) * b.amp) * w;
        const cy = (b.by + Math.cos(time * b.sy + b.py) * b.amp) * h;
        const rad = b.r * Math.min(w, h);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${b.color},0.22)`);
        g.addColorStop(1, `rgba(${b.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };

    if (reduce) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
