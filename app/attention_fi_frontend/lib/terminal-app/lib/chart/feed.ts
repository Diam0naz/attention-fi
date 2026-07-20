"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  TIMEFRAME_SECONDS,
  type Candle,
  type MarketDataProvider,
  type Timeframe,
} from "@/lib/terminal-app/lib/types";

export type FeedEvent = "history" | "live";
type FeedListener = (event: FeedEvent) => void;

const INITIAL_BARS = 500;
const BACKFILL_BARS = 500;

/**
 * Owns the candle array for one (symbol, timeframe): initial load, left-edge
 * backfill, and live bar updates. Consumers mutate chart series imperatively
 * from feed events — candle data never flows through React state.
 */
export class CandleFeed {
  candles: Candle[] = [];
  loading = false;
  /** true once the provider returns an empty page going backward */
  exhausted = false;

  private listeners = new Set<FeedListener>();
  private unsubLive: (() => void) | null = null;
  private disposed = false;
  private backfillInFlight = false;

  constructor(
    private provider: MarketDataProvider,
    readonly symbol: string,
    readonly timeframe: Timeframe,
  ) {}

  get barSeconds(): number {
    return TIMEFRAME_SECONDS[this.timeframe];
  }

  subscribe(cb: FeedListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(event: FeedEvent) {
    if (this.disposed) return;
    for (const cb of this.listeners) cb(event);
  }

  async start() {
    this.loading = true;
    const now = Math.floor(Date.now() / 1000);
    const from = now - this.barSeconds * INITIAL_BARS;
    try {
      const candles = await this.provider.getCandles(this.symbol, this.timeframe, from, now);
      if (this.disposed) return;
      this.candles = candles;
      this.loading = false;
      this.emit("history");
    } catch {
      this.loading = false;
    }

    this.unsubLive = this.provider.subscribeCandles(this.symbol, this.timeframe, (bar) => {
      if (this.disposed || this.candles.length === 0) return;
      const last = this.candles[this.candles.length - 1]!;
      if (bar.time === last.time) {
        this.candles[this.candles.length - 1] = bar;
        this.emit("live");
      } else if (bar.time > last.time) {
        this.candles.push(bar);
        this.emit("live");
      }
    });
  }

  /** Fetch an older page and prepend it. Safe to call repeatedly. */
  async loadOlder(): Promise<void> {
    if (this.backfillInFlight || this.exhausted || this.candles.length === 0) return;
    this.backfillInFlight = true;
    const oldest = this.candles[0]!.time;
    const from = oldest - this.barSeconds * BACKFILL_BARS;
    const to = oldest - this.barSeconds;
    try {
      const older = await this.provider.getCandles(this.symbol, this.timeframe, from, to);
      if (this.disposed) return;
      const fresh = older.filter((c) => c.time < oldest);
      if (fresh.length === 0) {
        this.exhausted = true;
      } else {
        this.candles = [...fresh, ...this.candles];
        this.emit("history");
      }
    } catch {
      /* transient backfill failure; the next left-edge approach retries */
    } finally {
      this.backfillInFlight = false;
    }
  }

  dispose() {
    this.disposed = true;
    this.unsubLive?.();
    this.listeners.clear();
  }
}

export function useCandleFeed(
  provider: MarketDataProvider,
  symbol: string,
  timeframe: Timeframe,
): CandleFeed {
  const feed = useMemo(
    () => new CandleFeed(provider, symbol, timeframe),
    [provider, symbol, timeframe],
  );
  const started = useRef<CandleFeed | null>(null);
  useEffect(() => {
    if (started.current !== feed) {
      started.current = feed;
      void feed.start();
    }
    return () => feed.dispose();
  }, [feed]);
  return feed;
}
