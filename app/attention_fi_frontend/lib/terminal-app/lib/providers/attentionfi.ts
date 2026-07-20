import type { PublicKey } from "@solana/web3.js";
import { fetchAllCurves, fetchGlobal, spotPriceSol, LAMPORTS_PER_SOL, type CurveState } from "@/lib/solana/curve";
import { getReadonlyProgram } from "@/lib/solana/program";
import { allTokenHandles, handleToMint } from "@/lib/solana/registry";
import {
  TIMEFRAME_SECONDS,
  type Candle,
  type ConnectionStatus,
  type MarketDataProvider,
  type OrderBook,
  type SymbolMeta,
  type TickerStats,
  type Tick,
  type Timeframe,
  type Unsubscribe,
} from "@/lib/terminal-app/lib/types";

/**
 * Live AttentionFi market data, straight off the devnet bonding curves.
 *
 * - Spot price is polled from on-chain curve state (virtual reserves) every
 *   few seconds for every symbol something is subscribed to.
 * - Live candles aggregate real polled prices; bar volume is the observed
 *   change in real SOL reserves (i.e. actual SOL traded through the curve).
 * - Historical candles before this session are SYNTHETIC: a deterministic
 *   random walk generated backward from the live spot price, so indicators
 *   and charts have context. They are reproducible per (symbol, timeframe)
 *   within a session and clearly documented as such — the chain does not
 *   store price history.
 * - The order book is the bonding curve itself: levels are marginal
 *   constant-product prices at increasing depth on each side.
 *
 * Prices are denominated in SOL per whole token.
 */

const POLL_MS = 8000;
const SYNTH_BACKFILL_BARS = 500;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface WatchState {
  mint: PublicKey;
  curve: CurveState | null;
  spot: number;
  lastRealSol: bigint | null;
  tickListeners: Set<(t: Tick) => void>;
  bookListeners: Set<{ depth: number; cb: (b: OrderBook) => void }>;
  candleListeners: Set<{ tf: Timeframe; cb: (c: Candle) => void }>;
  refs: number;
}

interface SeriesState {
  candles: Candle[];
  backRng: () => number;
  /** index into candles where real (live-observed) data begins */
  liveFrom: number;
}

export class AttentionFiProvider implements MarketDataProvider {
  readonly name = "attentionfi";

  private watches = new Map<string, WatchState>();
  private series = new Map<string, SeriesState>();
  private decimals = 6;
  private decimalsLoaded = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private status: ConnectionStatus = "down";
  private polling = false;

  /**
   * All curves in one shot: `bondingCurve.all()` is a single
   * getProgramAccounts request, so every consumer (chart, book, watchlist,
   * screener, ticket) shares one RPC call per wave instead of one per symbol.
   * The public devnet endpoint rate-limits hard; this keeps us under it.
   */
  private snapshot = new Map<string, CurveState>(); // key: mint base58
  private snapshotAt = 0;
  private snapshotInflight: Promise<void> | null = null;

  private refreshSnapshot(force = false): Promise<void> {
    if (!force && Date.now() - this.snapshotAt < POLL_MS / 2) {
      return Promise.resolve();
    }
    if (this.snapshotInflight) return this.snapshotInflight;
    this.snapshotInflight = (async () => {
      const curves = await fetchAllCurves(this.program);
      // fetchAllCurves returns [] on RPC errors — keep the last good snapshot
      if (curves.length > 0) {
        this.snapshot = new Map(curves.map((c) => [c.mint, c]));
      }
      this.snapshotAt = Date.now();
    })().finally(() => {
      this.snapshotInflight = null;
    });
    return this.snapshotInflight;
  }

  private curveFor(w: WatchState): CurveState | null {
    return this.snapshot.get(w.mint.toBase58()) ?? null;
  }

  /** refresh the snapshot (deduped) and prime a watch's spot from it */
  private async primeWatch(w: WatchState): Promise<CurveState | null> {
    await this.ensureDecimals();
    await this.refreshSnapshot();
    const curve = this.curveFor(w);
    if (curve && w.spot === 0) {
      w.curve = curve;
      w.spot = spotPriceSol(curve, this.decimals);
      w.lastRealSol = curve.realSolReserves;
    }
    return curve;
  }

  private get program() {
    return getReadonlyProgram();
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const cb of this.statusListeners) cb(s);
  }

  private async ensureDecimals(): Promise<void> {
    if (this.decimalsLoaded) return;
    const global = await fetchGlobal(this.program);
    if (global) this.decimals = global.tokenDecimals;
    this.decimalsLoaded = true;
  }

  /* ----- polling core ---------------------------------------------------- */

  private watch(symbol: string): WatchState | null {
    const key = symbol.toLowerCase();
    let w = this.watches.get(key);
    if (w) return w;
    const mint = handleToMint(key);
    if (!mint) return null;
    w = {
      mint,
      curve: null,
      spot: 0,
      lastRealSol: null,
      tickListeners: new Set(),
      bookListeners: new Set(),
      candleListeners: new Set(),
      refs: 0,
    };
    this.watches.set(key, w);
    return w;
  }

  private retain(w: WatchState) {
    w.refs += 1;
    if (!this.timer) {
      this.setStatus("connecting");
      this.timer = setInterval(() => void this.pollAll(), POLL_MS);
      void this.pollAll();
    }
  }

  private release(w: WatchState) {
    w.refs -= 1;
    const anyActive = [...this.watches.values()].some((x) => x.refs > 0);
    if (!anyActive && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.setStatus("down");
    }
  }

  /**
   * Opportunistic history recording: any open terminal pings the snapshot
   * endpoint (server-side throttled + chain-read, so clients can't inject
   * prices and concurrent tabs coalesce into one write).
   */
  private snapshotPingAt = 0;
  private pingSnapshot() {
    const now = Date.now();
    if (now - this.snapshotPingAt < 60_000) return;
    this.snapshotPingAt = now;
    void fetch("/api/market/snapshot").catch(() => undefined);
  }

  private async pollAll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    this.pingSnapshot();
    try {
      await this.ensureDecimals();
      await this.refreshSnapshot(true);
      let anyOk = false;
      for (const [key, w] of this.watches) {
        if (w.refs <= 0) continue;
        const curve = this.curveFor(w);
        if (!curve) continue;
        anyOk = true;
        const prevSpot = w.spot;
        const spot = spotPriceSol(curve, this.decimals);
        const tradedLamports =
          w.lastRealSol !== null
            ? curve.realSolReserves - w.lastRealSol
            : 0n;
        const tradedSol = Math.abs(Number(tradedLamports)) / LAMPORTS_PER_SOL;
        w.curve = curve;
        w.spot = spot;
        w.lastRealSol = curve.realSolReserves;

        this.applyToSeries(key, spot, tradedSol);

        if (prevSpot !== spot || tradedSol > 0) {
          const tick: Tick = {
            symbol: key,
            price: spot,
            qty: tradedSol,
            time: Date.now(),
            isSellerMaker: spot < prevSpot,
          };
          for (const cb of w.tickListeners) cb(tick);
        }
        for (const sub of w.bookListeners) {
          sub.cb(this.buildBook(key, curve, sub.depth));
        }
        for (const sub of w.candleListeners) {
          const last = this.getSeries(key, sub.tf, spot).candles.at(-1);
          if (last) sub.cb({ ...last });
        }
      }
      this.setStatus(anyOk ? "live" : "connecting");
    } catch {
      this.setStatus("down");
    } finally {
      this.polling = false;
    }
  }

  /* ----- candle series --------------------------------------------------- */

  private seriesKey(symbol: string, tf: Timeframe): string {
    return `${symbol.toLowerCase()}:${tf}`;
  }

  /** create or fetch a series; synthetic history is anchored at `spot` */
  private getSeries(symbol: string, tf: Timeframe, spot: number): SeriesState {
    const key = this.seriesKey(symbol, tf);
    let s = this.series.get(key);
    if (s) return s;
    const tfSec = TIMEFRAME_SECONDS[tf];
    const anchor = Math.floor(Date.now() / 1000 / tfSec) * tfSec;
    const price = spot > 0 ? spot : 1e-6;
    s = {
      candles: [
        { time: anchor, open: price, high: price, low: price, close: price, volume: 0 },
      ],
      backRng: mulberry32(hashString(key) ^ 0xa77e17),
      liveFrom: 0,
    };
    this.series.set(key, s);
    this.extendBack(s, tf, anchor - tfSec * SYNTH_BACKFILL_BARS);
    return s;
  }

  /** deterministic synthetic random walk generated backward from the anchor */
  private extendBack(s: SeriesState, tf: Timeframe, until: number) {
    const tfSec = TIMEFRAME_SECONDS[tf];
    const sigma = 0.01 * Math.sqrt(tfSec / 3600);
    let guard = 0;
    while (s.candles.length > 0 && s.candles[0]!.time > until && guard < 20000) {
      guard++;
      const first = s.candles[0]!;
      const close = first.open;
      const r = sigma * gaussian(s.backRng);
      const open = close / Math.exp(r);
      const wickUp = Math.abs(gaussian(s.backRng)) * sigma * 0.5;
      const wickDown = Math.abs(gaussian(s.backRng)) * sigma * 0.5;
      s.candles.unshift({
        time: first.time - tfSec,
        open,
        high: Math.max(open, close) * Math.exp(wickUp),
        low: Math.min(open, close) * Math.exp(-wickDown),
        close,
        volume: 0.05 + s.backRng() * 0.4,
      });
      s.liveFrom += 1;
    }
  }

  /** fold a real polled price into every timeframe series for the symbol */
  private applyToSeries(symbol: string, spot: number, tradedSol: number) {
    if (spot <= 0) return;
    const now = Math.floor(Date.now() / 1000);
    for (const [key, s] of this.series) {
      if (!key.startsWith(`${symbol.toLowerCase()}:`)) continue;
      const tf = key.split(":")[1] as Timeframe;
      const tfSec = TIMEFRAME_SECONDS[tf];
      const barTime = Math.floor(now / tfSec) * tfSec;
      let last = s.candles[s.candles.length - 1]!;
      // roll forward through any missed bars, carrying the close
      let guard = 0;
      while (last.time < barTime && guard < 5000) {
        guard++;
        const next: Candle = {
          time: last.time + tfSec,
          open: last.close,
          high: last.close,
          low: last.close,
          close: last.close,
          volume: 0,
        };
        s.candles.push(next);
        last = next;
      }
      last.close = spot;
      if (spot > last.high) last.high = spot;
      if (spot < last.low) last.low = spot;
      last.volume += tradedSol;
    }
  }

  /* ----- MarketDataProvider ---------------------------------------------- */

  async getCandles(
    symbol: string,
    tf: Timeframe,
    from: number,
    to: number,
  ): Promise<Candle[]> {
    const w = this.watch(symbol);
    if (!w) return [];
    await this.primeWatch(w);
    if (!this.series.has(this.seriesKey(symbol, tf))) {
      await this.seedRealHistory(symbol, w, tf);
    }
    const s = this.getSeries(symbol, tf, w.spot);
    this.extendBack(s, tf, from);
    return s.candles.filter((c) => c.time >= from && c.time <= to);
  }

  /**
   * Seed a fresh series from recorded snapshots (the candles API) so history
   * is real wherever snapshots exist; the synthetic walk only fills whatever
   * lies before the first recorded candle. Falls back silently to fully
   * synthetic when the API has nothing (no DB, or a brand-new token).
   */
  private async seedRealHistory(symbol: string, w: WatchState, tf: Timeframe): Promise<void> {
    try {
      const tfSec = TIMEFRAME_SECONDS[tf];
      const now = Math.floor(Date.now() / 1000);
      const from = now - tfSec * SYNTH_BACKFILL_BARS;
      const res = await fetch(
        `/api/market/candles?mint=${w.mint.toBase58()}&tf=${tfSec}&from=${from}&to=${now}`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { candles?: Candle[] };
      if (!body.candles || body.candles.length === 0) return;
      const key = this.seriesKey(symbol, tf);
      if (this.series.has(key)) return; // lost a seeding race — keep the winner
      this.series.set(key, {
        candles: body.candles.map((c) => ({ ...c })),
        backRng: mulberry32(hashString(key) ^ 0xa77e17),
        liveFrom: 0,
      });
    } catch {
      // offline or API error — synthetic fallback
    }
  }

  subscribeCandles(symbol: string, tf: Timeframe, cb: (c: Candle) => void): Unsubscribe {
    const w = this.watch(symbol);
    if (!w) return () => {};
    const sub = { tf, cb };
    w.candleListeners.add(sub);
    this.retain(w);
    return () => {
      w.candleListeners.delete(sub);
      this.release(w);
    };
  }

  subscribeTicks(symbol: string, cb: (t: Tick) => void): Unsubscribe {
    const w = this.watch(symbol);
    if (!w) return () => {};
    w.tickListeners.add(cb);
    this.retain(w);
    return () => {
      w.tickListeners.delete(cb);
      this.release(w);
    };
  }

  private buildBook(symbol: string, curve: CurveState, depth: number): OrderBook {
    const x = Number(curve.virtualSolReserves); // lamports
    const y = Number(curve.virtualTokenReserves); // raw tokens
    const k = x * y;
    const toSolPerToken = (lamportsPerRaw: number) =>
      (lamportsPerRaw * 10 ** this.decimals) / LAMPORTS_PER_SOL;
    const step = x * 0.0025; // 0.25% of virtual SOL per level

    const asks = [];
    let cumDx = 0;
    let prevTokens = y;
    for (let i = 0; i < depth; i++) {
      cumDx += step;
      const tokensAfter = k / (x + cumDx);
      const tokensBought = prevTokens - tokensAfter;
      prevTokens = tokensAfter;
      const marginal = (x + cumDx) ** 2 / k; // lamports per raw token
      asks.push({
        price: toSolPerToken(marginal),
        qty: tokensBought / 10 ** this.decimals,
      });
    }

    const bids = [];
    let cumDy = 0;
    let prevSol = x;
    const stepTokens = y * 0.0025;
    for (let i = 0; i < depth; i++) {
      cumDy += stepTokens;
      const solAfter = k / (y + cumDy);
      prevSol = solAfter;
      const marginal = solAfter ** 2 / k;
      void prevSol;
      bids.push({
        price: toSolPerToken(marginal),
        qty: stepTokens / 10 ** this.decimals,
      });
    }

    return { symbol: symbol.toLowerCase(), bids, asks, time: Date.now() };
  }

  async getOrderBook(symbol: string, depth: number): Promise<OrderBook> {
    const w = this.watch(symbol);
    if (!w) return { symbol, bids: [], asks: [], time: Date.now() };
    const curve = w.curve ?? (await this.primeWatch(w));
    if (!curve) return { symbol, bids: [], asks: [], time: Date.now() };
    return this.buildBook(symbol, curve, depth);
  }

  subscribeOrderBook(
    symbol: string,
    depth: number,
    cb: (b: OrderBook) => void,
  ): Unsubscribe {
    const w = this.watch(symbol);
    if (!w) return () => {};
    const sub = { depth, cb };
    w.bookListeners.add(sub);
    this.retain(w);
    if (w.curve) cb(this.buildBook(symbol, w.curve, depth));
    return () => {
      w.bookListeners.delete(sub);
      this.release(w);
    };
  }

  async searchSymbols(query: string): Promise<SymbolMeta[]> {
    const q = query.trim().replace(/^@/, "").toLowerCase();
    return allTokenHandles()
      .filter((h) => !q || h.includes(q))
      .map((h) => ({
        symbol: h,
        base: h.toUpperCase().slice(0, 6),
        quote: "SOL",
        description: `@${h} — AttentionFi bonding curve`,
        pricePrecision: 8,
        qtyPrecision: 2,
      }));
  }

  async getTickerStats(symbols?: string[]): Promise<TickerStats[]> {
    await this.ensureDecimals();
    await this.refreshSnapshot();
    const targets = (symbols ?? allTokenHandles()).map((s) => s.toLowerCase());
    const out: TickerStats[] = [];
    for (const sym of targets) {
      const w = this.watch(sym);
      if (!w) continue;
      const curve = this.curveFor(w);
      if (!curve) continue;
      if (w.spot === 0) {
        w.curve = curve;
        w.spot = spotPriceSol(curve, this.decimals);
        w.lastRealSol = curve.realSolReserves;
      }
      const s = this.getSeries(sym, "1h", w.spot);
      const candles = s.candles.slice(-24);
      const first = candles[0];
      const last = candles[candles.length - 1];
      if (!first || !last) continue;
      let high = -Infinity;
      let low = Infinity;
      let volume = 0;
      for (const c of candles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
        volume += c.volume;
      }
      const change = last.close - first.open;
      out.push({
        symbol: sym,
        last: last.close,
        change,
        changePercent: first.open !== 0 ? (change / first.open) * 100 : 0,
        high,
        low,
        volume,
        quoteVolume: volume,
      });
    }
    return out;
  }

  subscribeStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }
}
