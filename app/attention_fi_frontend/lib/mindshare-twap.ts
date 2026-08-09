/**
 * Time-weighted mindshare, and why the smoothing lives here rather than on-chain.
 *
 * The pre-launch checklist flags spot mindshare as gameable: "if mindshare
 * updates instantly when someone goes viral, it's gameable — buy just before a
 * big post drops." That is a real hole, because mindshare seeds a launch's
 * starting price through `launch_from_feed`, and a launcher who wants to sell
 * into their own token benefits from a high seed.
 *
 * The obvious fix — an accumulator on `MindshareState` — cannot work. That
 * account is keyed by mint, and at launch the mint does not exist yet, so there
 * is no history to average. Every other consumer of mindshare is display-only.
 * So the average has to be published by the feed itself, which means computing
 * it where the feed's data comes from: here.
 *
 * That is not a weaker guarantee than smoothing on-chain would be. Switchboard
 * oracles fetch this endpoint; they do not independently measure X. Averaging a
 * number after the oracles have read it would smooth the *feed*, which is not
 * the threat — the threat is a spike in the underlying data being timed against
 * a launch. Publishing an already-averaged number closes exactly that.
 */

/** One stored observation. `time` is unix seconds. */
export interface MindsharePoint {
  time: number;
  mindshare: number;
}

/** The window the checklist asks for. */
export const TWAP_WINDOW_SEC = 24 * 3600;

/**
 * Time-weighted mean of `points` over the trailing `windowSec` ending at `now`.
 *
 * Weighted by how long each reading *stood*, not by how many readings there
 * were — snapshots are written on a throttle and land irregularly, so a plain
 * mean would let a burst of writes during a spike outvote the hours either side
 * of it. That is the manipulation being defended against, so counting samples
 * instead of seconds would reintroduce it in a subtler form.
 *
 * The last reading is carried to `now`, since a value stands until something
 * replaces it. Readings before the window are dropped, except that the newest
 * one among them seeds the window's opening value — otherwise a quiet handle
 * with no writes in 24h would average to nothing rather than to its last known
 * level.
 *
 * Returns null when there is nothing to average; callers should fall back to
 * spot and say so rather than inventing a number.
 */
export function timeWeightedMindshare(
  points: readonly MindsharePoint[],
  now: number,
  windowSec: number = TWAP_WINDOW_SEC,
): number | null {
  if (points.length === 0) return null;

  const start = now - windowSec;
  const sorted = [...points].sort((a, b) => a.time - b.time);

  // The value in force when the window opened: the newest reading at or before
  // it. Without this, a handle whose last write predates the window has no
  // opening value and averages to zero.
  let opening: number | null = null;
  for (const p of sorted) {
    if (p.time <= start) opening = p.mindshare;
    else break;
  }

  const inWindow = sorted.filter((p) => p.time > start && p.time <= now);
  if (opening === null && inWindow.length === 0) return null;

  let weighted = 0;
  let elapsed = 0;
  let cursorTime = start;
  let cursorValue = opening ?? inWindow[0]!.mindshare;

  for (const p of inWindow) {
    const span = p.time - cursorTime;
    if (span > 0) {
      weighted += cursorValue * span;
      elapsed += span;
    }
    cursorTime = p.time;
    cursorValue = p.mindshare;
  }

  // A reading stands until it is replaced, so the last one covers the tail.
  const tail = now - cursorTime;
  if (tail > 0) {
    weighted += cursorValue * tail;
    elapsed += tail;
  }

  if (elapsed <= 0) return cursorValue;
  return weighted / elapsed;
}

/**
 * How much of the window the data actually covers, 0..1.
 *
 * Published alongside the average so a consumer can tell a genuine 24-hour
 * mean from one computed over forty minutes of history. A feed that silently
 * reported the latter as a TWAP would be worse than reporting spot, because it
 * would look like protection that isn't there.
 */
export function windowCoverage(
  points: readonly MindsharePoint[],
  now: number,
  windowSec: number = TWAP_WINDOW_SEC,
): number {
  if (points.length === 0) return 0;
  const start = now - windowSec;
  const oldest = Math.min(...points.map((p) => p.time));
  if (oldest <= start) return 1;
  return Math.max(0, Math.min(1, (now - oldest) / windowSec));
}
