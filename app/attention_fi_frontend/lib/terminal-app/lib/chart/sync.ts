import type { LogicalRange } from "lightweight-charts";

/**
 * Tiny pub/sub bus for multi-chart grid sync. Charts publish their visible
 * logical range and crosshair time; peers apply them. The `origin` id guards
 * against feedback loops.
 */

type RangeListener = (origin: string, range: LogicalRange) => void;
type CrosshairListener = (origin: string, time: number | null) => void;

const rangeListeners = new Set<RangeListener>();
const crosshairListeners = new Set<CrosshairListener>();

export function publishRange(origin: string, range: LogicalRange) {
  for (const l of rangeListeners) l(origin, range);
}

export function onRange(cb: RangeListener): () => void {
  rangeListeners.add(cb);
  return () => rangeListeners.delete(cb);
}

export function publishCrosshair(origin: string, time: number | null) {
  for (const l of crosshairListeners) l(origin, time);
}

export function onCrosshair(cb: CrosshairListener): () => void {
  crosshairListeners.add(cb);
  return () => crosshairListeners.delete(cb);
}
