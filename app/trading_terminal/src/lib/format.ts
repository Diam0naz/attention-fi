/** Format a price with sensible precision for its magnitude. */
export function fmtPrice(p: number, precision?: number): string {
  if (!Number.isFinite(p)) return "—";
  if (precision !== undefined) return p.toFixed(precision);
  const abs = Math.abs(p);
  if (abs >= 10000) return p.toFixed(1);
  if (abs >= 100) return p.toFixed(2);
  if (abs >= 1) return p.toFixed(4);
  if (abs >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

export function fmtQty(q: number): string {
  if (!Number.isFinite(q)) return "—";
  const abs = Math.abs(q);
  if (abs >= 1_000_000) return `${(q / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(q / 1_000).toFixed(2)}K`;
  if (abs >= 1) return q.toFixed(3);
  return q.toFixed(5);
}

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export function fmtPercent(n: number, signed = true): string {
  if (!Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtSigned(n: number, precision?: number): string {
  const s = fmtPrice(Math.abs(n), precision);
  return n >= 0 ? `+${s}` : `-${s}`;
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function fmtCountdown(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
