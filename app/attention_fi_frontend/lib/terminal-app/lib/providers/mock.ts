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
 * Deterministic offline market data.
 *
 * Prices follow geometric Brownian motion with volatility clustering: the
 * instantaneous volatility is itself a mean-reverting log-OU process, so calm
 * regimes and violent regimes alternate the way real markets do. Every random
 * draw comes from a mulberry32 PRNG seeded from (symbol, timeframe), so a
 * given session's history is reproducible and consistent across panels.
 *
 * Series are generated backward from a fixed per-session anchor bar and cached;
 * infinite left-scroll extends the cache backward deterministically.
 */

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

/** Box-Muller standard normal from a uniform PRNG. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const MOCK_SYMBOLS: SymbolMeta[] = [
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT", description: "Bitcoin / Tether (mock)", pricePrecision: 2, qtyPrecision: 5 },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT", description: "Ethereum / Tether (mock)", pricePrecision: 2, qtyPrecision: 4 },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT", description: "Solana / Tether (mock)", pricePrecision: 3, qtyPrecision: 2 },
  { symbol: "BNBUSDT", base: "BNB", quote: "USDT", description: "BNB / Tether (mock)", pricePrecision: 2, qtyPrecision: 3 },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT", description: "XRP / Tether (mock)", pricePrecision: 4, qtyPrecision: 1 },
  { symbol: "ADAUSDT", base: "ADA", quote: "USDT", description: "Cardano / Tether (mock)", pricePrecision: 4, qtyPrecision: 1 },
  { symbol: "UNIUSDT", base: "UNI", quote: "USDT", description: "Uniswap / Tether (mock)", pricePrecision: 3, qtyPrecision: 2 },
  { symbol: "AAVEUSDT", base: "AAVE", quote: "USDT", description: "Aave / Tether (mock)", pricePrecision: 2, qtyPrecision: 3 },
  { symbol: "LINKUSDT", base: "LINK", quote: "USDT", description: "Chainlink / Tether (mock)", pricePrecision: 3, qtyPrecision: 2 },
  { symbol: "MKRUSDT", base: "MKR", quote: "USDT", description: "Maker / Tether (mock)", pricePrecision: 1, qtyPrecision: 4 },
];

const BASE_PRICE: Record<string, number> = {
  BTCUSDT: 64000,
  ETHUSDT: 3400,
  SOLUSDT: 155,
  BNBUSDT: 590,
  XRPUSDT: 0.52,
  ADAUSDT: 0.44,
  UNIUSDT: 9.8,
  AAVEUSDT: 92,
  LINKUSDT: 14.5,
  MKRUSDT: 2400,
};

interface SeriesState {
  /** contiguous candles, ascending by time */
  candles: Candle[];
  /** generator state for extending backward */
  backRng: () => number;
  backLogVol: number;
  /** generator state for extending forward (live bars) */
  fwdRng: () => number;
  fwdLogVol: number;
}

/** annualized-ish base vol scaled to bar duration */
function volParams(tfSec: number): { base: number; noise: number } {
  const scale = Math.sqrt(tfSec / 3600);
  return { base: 0.006 * scale, noise: 0.35 };
}

export class MockProvider implements MarketDataProvider {
  readonly name = "mock";
  private series = new Map<string, SeriesState>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();

  private key(symbol: string, tf: Timeframe): string {
    return `${symbol.toUpperCase()}:${tf}`;
  }

  private anchorTime(tfSec: number): number {
    return Math.floor(Date.now() / 1000 / tfSec) * tfSec;
  }

  private getSeries(symbol: string, tf: Timeframe): SeriesState {
    const key = this.key(symbol, tf);
    let state = this.series.get(key);
    if (state) return state;

    const tfSec = TIMEFRAME_SECONDS[tf];
    const anchor = this.anchorTime(tfSec);
    const seed = hashString(key);
    const base = BASE_PRICE[symbol.toUpperCase()] ?? 50 + (seed % 1000) / 10;

    state = {
      candles: [],
      backRng: mulberry32(seed ^ 0xdeadbeef),
      backLogVol: 0,
      fwdRng: mulberry32(seed ^ 0x12345678),
      fwdLogVol: 0,
    };
    // seed the anchor bar
    const first = this.makeBar(symbol, tf, anchor, base, state.fwdRng, () => {});
    state.candles.push(first);
    this.series.set(key, state);
    return state;
  }

  private makeBar(
    symbol: string,
    tf: Timeframe,
    time: number,
    open: number,
    rng: () => number,
    _unused: () => void,
  ): Candle {
    const tfSec = TIMEFRAME_SECONDS[tf];
    const { base } = volParams(tfSec);
    const sigma = base;
    const drift = 0;
    const r = drift + sigma * gaussian(rng);
    const close = open * Math.exp(r);
    const wickUp = Math.abs(gaussian(rng)) * sigma * 0.6;
    const wickDown = Math.abs(gaussian(rng)) * sigma * 0.6;
    const high = Math.max(open, close) * Math.exp(wickUp);
    const low = Math.min(open, close) * Math.exp(-wickDown);
    const volume =
      (BASE_PRICE[symbol.toUpperCase()] ?? 100) *
      10 *
      (0.4 + rng()) *
      (1 + Math.abs(r) / sigma);
    return { time, open, high, low, close, volume };
  }

  /** extend the cached series backward with vol clustering */
  private extendBack(state: SeriesState, symbol: string, tf: Timeframe, until: number) {
    const tfSec = TIMEFRAME_SECONDS[tf];
    const { base, noise } = volParams(tfSec);
    let guard = 0;
    while (state.candles.length > 0 && state.candles[0]!.time > until && guard < 20000) {
      guard++;
      const first = state.candles[0]!;
      const time = first.time - tfSec;
      // walking backward: this bar's close is the next bar's open
      const close = first.open;
      // log-OU vol process
      state.backLogVol =
        state.backLogVol * 0.97 + noise * gaussian(state.backRng) * 0.25;
      const sigma = base * Math.exp(state.backLogVol);
      const r = sigma * gaussian(state.backRng);
      const open = close / Math.exp(r);
      const wickUp = Math.abs(gaussian(state.backRng)) * sigma * 0.6;
      const wickDown = Math.abs(gaussian(state.backRng)) * sigma * 0.6;
      const high = Math.max(open, close) * Math.exp(wickUp);
      const low = Math.min(open, close) * Math.exp(-wickDown);
      const volume =
        (BASE_PRICE[symbol.toUpperCase()] ?? 100) *
        10 *
        (0.4 + state.backRng()) *
        (1 + Math.abs(r) / base);
      state.candles.unshift({ time, open, high, low, close, volume });
    }
  }

  /** roll live bars forward to now */
  private rollForward(state: SeriesState, symbol: string, tf: Timeframe) {
    const tfSec = TIMEFRAME_SECONDS[tf];
    const now = this.anchorTime(tfSec);
    const { base, noise } = volParams(tfSec);
    let last = state.candles[state.candles.length - 1]!;
    let guard = 0;
    while (last.time < now && guard < 5000) {
      guard++;
      state.fwdLogVol = state.fwdLogVol * 0.97 + noise * gaussian(state.fwdRng) * 0.25;
      const sigma = base * Math.exp(state.fwdLogVol);
      const open = last.close;
      const r = sigma * gaussian(state.fwdRng);
      const close = open * Math.exp(r);
      const wickUp = Math.abs(gaussian(state.fwdRng)) * sigma * 0.6;
      const wickDown = Math.abs(gaussian(state.fwdRng)) * sigma * 0.6;
      const next: Candle = {
        time: last.time + tfSec,
        open,
        high: Math.max(open, close) * Math.exp(wickUp),
        low: Math.min(open, close) * Math.exp(-wickDown),
        close,
        volume:
          (BASE_PRICE[symbol.toUpperCase()] ?? 100) *
          10 *
          (0.4 + state.fwdRng()) *
          (1 + Math.abs(r) / base),
      };
      state.candles.push(next);
      last = next;
    }
  }

  async getCandles(
    symbol: string,
    tf: Timeframe,
    from: number,
    to: number,
  ): Promise<Candle[]> {
    const state = this.getSeries(symbol, tf);
    this.rollForward(state, symbol, tf);
    this.extendBack(state, symbol, tf, from);
    return state.candles.filter((c) => c.time >= from && c.time <= to);
  }

  subscribeCandles(
    symbol: string,
    tf: Timeframe,
    cb: (c: Candle) => void,
  ): Unsubscribe {
    const state = this.getSeries(symbol, tf);
    const tfSec = TIMEFRAME_SECONDS[tf];
    const rng = mulberry32(hashString(this.key(symbol, tf)) ^ 0xabcdef);
    const { base } = volParams(tfSec);

    const timer = setInterval(() => {
      this.rollForward(state, symbol, tf);
      const last = state.candles[state.candles.length - 1];
      if (!last) return;
      // intrabar movement: nudge the close, stretch wicks
      const dr = base * 0.12 * gaussian(rng);
      last.close = last.close * Math.exp(dr);
      if (last.close > last.high) last.high = last.close;
      if (last.close < last.low) last.low = last.close;
      last.volume += last.volume * 0.002 * rng();
      cb({ ...last });
    }, 500);
    cb({ ...state.candles[state.candles.length - 1]! });
    return () => clearInterval(timer);
  }

  subscribeTicks(symbol: string, cb: (t: Tick) => void): Unsubscribe {
    const sym = symbol.toUpperCase();
    const state = this.getSeries(symbol, "1m");
    const rng = mulberry32(hashString(sym) ^ 0x55aa55aa);
    const timer = setInterval(() => {
      this.rollForward(state, symbol, "1m");
      const last = state.candles[state.candles.length - 1];
      if (!last) return;
      const price = last.close * Math.exp(0.0004 * gaussian(rng));
      cb({
        symbol: sym,
        price,
        qty: Math.abs(gaussian(rng)) * 0.8 + 0.01,
        time: Date.now(),
        isSellerMaker: rng() < 0.5,
      });
    }, 350);
    return () => clearInterval(timer);
  }

  async getOrderBook(symbol: string, depth: number): Promise<OrderBook> {
    return this.makeBook(symbol, depth);
  }

  private makeBook(symbol: string, depth: number): OrderBook {
    const sym = symbol.toUpperCase();
    const state = this.getSeries(symbol, "1m");
    this.rollForward(state, symbol, "1m");
    const mid = state.candles[state.candles.length - 1]!.close;
    const rng = mulberry32(hashString(sym) ^ (Date.now() & 0xffff));
    const spread = mid * 0.0002;
    const bids = [];
    const asks = [];
    for (let i = 0; i < depth; i++) {
      const step = mid * 0.00012 * (i + 1);
      bids.push({ price: mid - spread / 2 - step, qty: Math.abs(gaussian(rng)) * 3 + 0.05 });
      asks.push({ price: mid + spread / 2 + step, qty: Math.abs(gaussian(rng)) * 3 + 0.05 });
    }
    return { symbol: sym, bids, asks, time: Date.now() };
  }

  subscribeOrderBook(
    symbol: string,
    depth: number,
    cb: (b: OrderBook) => void,
  ): Unsubscribe {
    const timer = setInterval(() => cb(this.makeBook(symbol, depth)), 250);
    cb(this.makeBook(symbol, depth));
    return () => clearInterval(timer);
  }

  async searchSymbols(query: string): Promise<SymbolMeta[]> {
    const q = query.trim().toUpperCase();
    if (!q) return MOCK_SYMBOLS;
    return MOCK_SYMBOLS.filter(
      (s) => s.symbol.includes(q) || s.description.toUpperCase().includes(q),
    );
  }

  async getTickerStats(symbols?: string[]): Promise<TickerStats[]> {
    const targets = symbols?.map((s) => s.toUpperCase()) ?? MOCK_SYMBOLS.map((s) => s.symbol);
    const out: TickerStats[] = [];
    for (const sym of targets) {
      const state = this.getSeries(sym, "1h");
      this.rollForward(state, sym, "1h");
      this.extendBack(
        state,
        sym,
        "1h",
        this.anchorTime(3600) - 24 * 3600,
      );
      const candles = state.candles.slice(-24);
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
        changePercent: (change / first.open) * 100,
        high,
        low,
        volume,
        quoteVolume: volume * last.close,
      });
    }
    return out;
  }

  subscribeStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    cb("live");
    return () => this.statusListeners.delete(cb);
  }
}
