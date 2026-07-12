"use client";

import { useEffect, useRef } from "react";

interface ThreadsProps {
  className?: string;
  /** Number of flowing lines. */
  count?: number;
  color?: string;
}

/**
 * react-bits "Threads" — flowing animated lines. Dependency-free canvas port
 * (the original uses WebGL/OGL). Drifting sine threads, DPR-aware, cleaned up on
 * unmount, and frozen for users who prefer reduced motion.
 */
export function Threads({ className, count = 6, color = "0, 255, 133" }: ThreadsProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;

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
      const t = time / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < count; i++) {
        const p = i / (count - 1);
        const baseY = h * (0.15 + 0.7 * p);
        const amp = 14 + 10 * Math.sin(p * 6.28);
        const speed = 0.25 + p * 0.35;
        const opacity = 0.05 + 0.12 * (1 - Math.abs(p - 0.5) * 2);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y =
            baseY +
            Math.sin(x * 0.006 + t * speed + p * 3) * amp +
            Math.sin(x * 0.013 - t * speed * 0.6) * (amp * 0.4);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${color}, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };

    if (reduce) {
      draw(0);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count, color]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
