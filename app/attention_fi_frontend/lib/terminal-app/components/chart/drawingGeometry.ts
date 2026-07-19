import type { Drawing, DrawingPoint } from "@/lib/terminal-app/stores/drawings";

export interface Pt {
  x: number;
  y: number;
}

export interface CoordSpace {
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
  xToTime: (x: number) => number | null;
  yToPrice: (y: number) => number | null;
  width: number;
  height: number;
}

export const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618];

export function toPt(space: CoordSpace, p: DrawingPoint): Pt | null {
  const x = space.timeToX(p.time);
  const y = space.priceToY(p.price);
  if (x === null || y === null) return null;
  return { x, y };
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** extend a→b beyond b until it exits the canvas bounds */
export function extendRay(a: Pt, b: Pt, width: number, height: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (width - a.x) / dx);
  else if (dx < 0) t = Math.min(t, -a.x / dx);
  if (dy > 0) t = Math.min(t, (height - a.y) / dy);
  else if (dy < 0) t = Math.min(t, -a.y / dy);
  if (!Number.isFinite(t)) return b;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export type HitRegion =
  | { kind: "body" }
  | { kind: "handle"; index: number };

export interface Hit {
  drawing: Drawing;
  region: HitRegion;
}

const HANDLE_RADIUS = 5;
const HIT_TOLERANCE = 6;

export function hitTest(space: CoordSpace, drawings: Drawing[], p: Pt): Hit | null {
  // iterate topmost (last drawn) first
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    const pts = d.points.map((dp) => toPt(space, dp));
    // handles take priority
    for (let h = 0; h < pts.length; h++) {
      const hp = pts[h];
      if (hp && Math.hypot(p.x - hp.x, p.y - hp.y) <= HANDLE_RADIUS + 3) {
        return { drawing: d, region: { kind: "handle", index: h } };
      }
    }
    if (hitBody(space, d, pts, p)) return { drawing: d, region: { kind: "body" } };
  }
  return null;
}

function hitBody(space: CoordSpace, d: Drawing, pts: (Pt | null)[], p: Pt): boolean {
  const [a, b, c] = pts;
  switch (d.tool) {
    case "hline": {
      const y = a?.y;
      return y !== undefined && Math.abs(p.y - y) <= HIT_TOLERANCE;
    }
    case "vline": {
      const x = a?.x;
      return x !== undefined && Math.abs(p.x - x) <= HIT_TOLERANCE;
    }
    case "trendline":
    case "measure":
      return !!a && !!b && distToSegment(p, a, b) <= HIT_TOLERANCE;
    case "ray": {
      if (!a || !b) return false;
      const end = extendRay(a, b, space.width, space.height);
      return distToSegment(p, a, end) <= HIT_TOLERANCE;
    }
    case "rect": {
      if (!a || !b) return false;
      const x0 = Math.min(a.x, b.x) - HIT_TOLERANCE;
      const x1 = Math.max(a.x, b.x) + HIT_TOLERANCE;
      const y0 = Math.min(a.y, b.y) - HIT_TOLERANCE;
      const y1 = Math.max(a.y, b.y) + HIT_TOLERANCE;
      return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    }
    case "fib-retracement": {
      if (!a || !b) return false;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      if (p.x < x0 - HIT_TOLERANCE || p.x > x1 + HIT_TOLERANCE) return false;
      for (const level of FIB_RETRACEMENT_LEVELS) {
        const y = a.y + (b.y - a.y) * level;
        if (Math.abs(p.y - y) <= HIT_TOLERANCE) return true;
      }
      return distToSegment(p, a, b) <= HIT_TOLERANCE;
    }
    case "fib-extension": {
      if (!a || !b || !c) return false;
      if (distToSegment(p, a, b) <= HIT_TOLERANCE) return true;
      if (distToSegment(p, b, c) <= HIT_TOLERANCE) return true;
      const span = b.y - a.y;
      for (const level of FIB_EXTENSION_LEVELS) {
        const y = c.y + span * level;
        if (p.x >= c.x - HIT_TOLERANCE && Math.abs(p.y - y) <= HIT_TOLERANCE) return true;
      }
      return false;
    }
    case "text": {
      if (!a) return false;
      const w = Math.max(40, (d.text?.length ?? 0) * 7);
      return p.x >= a.x - 4 && p.x <= a.x + w && p.y >= a.y - 14 && p.y <= a.y + 6;
    }
  }
}
