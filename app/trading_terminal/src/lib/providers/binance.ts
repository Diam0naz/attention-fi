import type {
  Candle,
  ConnectionStatus,
  MarketDataProvider,
  OrderBook,
  SymbolMeta,
  TickerStats,
  Tick,
  Timeframe,
  Unsubscribe,
} from "@/lib/types";

const REST = "https://api.binance.com/api/v3";
const WS = "wss://stream.binance.com:9443/stream";

/**
 * One shared multiplexed socket for the whole app. Streams are refcounted:
 * SUBSCRIBE on first listener, UNSUBSCRIBE when the last one leaves,
 * automatic resubscribe after reconnect with exponential backoff.
 */
class BinanceSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private status: ConnectionStatus = "down";
  private msgId = 1;
  private backoff = 500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const cb of this.statusListeners) cb(s);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private ensureConnected() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.closedByUser = false;
    this.setStatus("connecting");
    const ws = new WebSocket(WS);
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 500;
      this.setStatus("live");
      const streams = [...this.listeners.keys()];
      if (streams.length > 0) this.send({ method: "SUBSCRIBE", params: streams });
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          stream?: string;
          data?: unknown;
        };
        if (!msg.stream || msg.data === undefined) return;
        const subs = this.listeners.get(msg.stream);
        if (subs) for (const cb of subs) cb(msg.data);
      } catch {
        /* non-JSON control frame */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.setStatus("down");
      if (this.listeners.size > 0) this.scheduleReconnect();
    };
    ws.onerror = () => {
      ws.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size > 0) this.ensureConnected();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...payload, id: this.msgId++ }));
    }
  }

  subscribe(stream: string, cb: (data: unknown) => void): Unsubscribe {
    let subs = this.listeners.get(stream);
    if (!subs) {
      subs = new Set();
      this.listeners.set(stream, subs);
      this.ensureConnected();
      this.send({ method: "SUBSCRIBE", params: [stream] });
    }
    subs.add(cb);
    return () => {
      const cur = this.listeners.get(stream);
      if (!cur) return;
      cur.delete(cb);
      if (cur.size === 0) {
        this.listeners.delete(stream);
        this.send({ method: "UNSUBSCRIBE", params: [stream] });
        if (this.listeners.size === 0 && this.ws) {
          this.closedByUser = true;
          this.ws.close();
          this.ws = null;
          this.setStatus("down");
        }
      }
    };
  }
}

interface BinanceKline {
  0: number; // open time ms
  1: string; // open
  2: string; // high
  3: string; // low
  4: string; // close
  5: string; // volume
}

interface KlineEvent {
  k: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
  };
}

interface TradeEvent {
  p: string;
  q: string;
  T: number;
  m: boolean;
}

interface DepthEvent {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}

export class BinanceProvider implements MarketDataProvider {
  readonly name = "binance";
  private socket = new BinanceSocket();
  private symbolCache: SymbolMeta[] | null = null;
  private symbolCachePromise: Promise<SymbolMeta[]> | null = null;

  async getCandles(
    symbol: string,
    tf: Timeframe,
    from: number,
    to: number,
  ): Promise<Candle[]> {
    const url = `${REST}/klines?symbol=${symbol.toUpperCase()}&interval=${tf}&startTime=${from * 1000}&endTime=${to * 1000}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance klines ${res.status}`);
    const rows = (await res.json()) as BinanceKline[];
    return rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
    }));
  }

  subscribeCandles(
    symbol: string,
    tf: Timeframe,
    cb: (c: Candle) => void,
  ): Unsubscribe {
    const stream = `${symbol.toLowerCase()}@kline_${tf}`;
    return this.socket.subscribe(stream, (data) => {
      const k = (data as KlineEvent).k;
      cb({
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
      });
    });
  }

  subscribeTicks(symbol: string, cb: (t: Tick) => void): Unsubscribe {
    const stream = `${symbol.toLowerCase()}@trade`;
    const sym = symbol.toUpperCase();
    return this.socket.subscribe(stream, (data) => {
      const t = data as TradeEvent;
      cb({
        symbol: sym,
        price: parseFloat(t.p),
        qty: parseFloat(t.q),
        time: t.T,
        isSellerMaker: t.m,
      });
    });
  }

  async getOrderBook(symbol: string, depth: number): Promise<OrderBook> {
    const limit = depth <= 5 ? 5 : depth <= 10 ? 10 : 20;
    const res = await fetch(`${REST}/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`);
    if (!res.ok) throw new Error(`Binance depth ${res.status}`);
    const data = (await res.json()) as DepthEvent;
    return {
      symbol: symbol.toUpperCase(),
      bids: data.bids.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) })),
      asks: data.asks.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) })),
      time: Date.now(),
    };
  }

  subscribeOrderBook(
    symbol: string,
    depth: number,
    cb: (b: OrderBook) => void,
  ): Unsubscribe {
    const levels = depth <= 5 ? 5 : depth <= 10 ? 10 : 20;
    const stream = `${symbol.toLowerCase()}@depth${levels}@100ms`;
    const sym = symbol.toUpperCase();
    return this.socket.subscribe(stream, (data) => {
      const d = data as DepthEvent;
      cb({
        symbol: sym,
        bids: d.bids.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) })),
        asks: d.asks.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) })),
        time: Date.now(),
      });
    });
  }

  private async loadSymbols(): Promise<SymbolMeta[]> {
    if (this.symbolCache) return this.symbolCache;
    this.symbolCachePromise ??= (async () => {
      const res = await fetch(`${REST}/exchangeInfo?permissions=SPOT`);
      if (!res.ok) throw new Error(`Binance exchangeInfo ${res.status}`);
      const data = (await res.json()) as {
        symbols: {
          symbol: string;
          baseAsset: string;
          quoteAsset: string;
          status: string;
          filters: { filterType: string; tickSize?: string; stepSize?: string }[];
        }[];
      };
      const metas: SymbolMeta[] = [];
      for (const s of data.symbols) {
        if (s.status !== "TRADING") continue;
        const priceFilter = s.filters.find((f) => f.filterType === "PRICE_FILTER");
        const lotFilter = s.filters.find((f) => f.filterType === "LOT_SIZE");
        metas.push({
          symbol: s.symbol,
          base: s.baseAsset,
          quote: s.quoteAsset,
          description: `${s.baseAsset} / ${s.quoteAsset}`,
          pricePrecision: decimalsOf(priceFilter?.tickSize),
          qtyPrecision: decimalsOf(lotFilter?.stepSize),
        });
      }
      this.symbolCache = metas;
      return metas;
    })();
    return this.symbolCachePromise;
  }

  async searchSymbols(query: string): Promise<SymbolMeta[]> {
    const all = await this.loadSymbols();
    const q = query.trim().toUpperCase();
    if (!q) {
      return all.filter((s) => s.quote === "USDT").slice(0, 50);
    }
    // fuzzy: subsequence match, ranked by (exact > prefix > substring > subsequence)
    const scored: { meta: SymbolMeta; score: number }[] = [];
    for (const meta of all) {
      const sym = meta.symbol;
      let score: number;
      if (sym === q) score = 0;
      else if (sym.startsWith(q)) score = 1 + sym.length / 100;
      else if (sym.includes(q)) score = 2 + sym.indexOf(q) / 100;
      else if (isSubsequence(q, sym)) score = 3 + sym.length / 100;
      else continue;
      // prefer USDT quotes among equal ranks
      if (meta.quote !== "USDT") score += 0.4;
      scored.push({ meta, score });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 50).map((s) => s.meta);
  }

  async getTickerStats(symbols?: string[]): Promise<TickerStats[]> {
    let url = `${REST}/ticker/24hr`;
    if (symbols && symbols.length > 0) {
      url += `?symbols=${encodeURIComponent(JSON.stringify(symbols.map((s) => s.toUpperCase())))}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance ticker ${res.status}`);
    const rows = (await res.json()) as {
      symbol: string;
      lastPrice: string;
      priceChange: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
      volume: string;
      quoteVolume: string;
    }[];
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({
      symbol: r.symbol,
      last: parseFloat(r.lastPrice),
      change: parseFloat(r.priceChange),
      changePercent: parseFloat(r.priceChangePercent),
      high: parseFloat(r.highPrice),
      low: parseFloat(r.lowPrice),
      volume: parseFloat(r.volume),
      quoteVolume: parseFloat(r.quoteVolume),
    }));
  }

  subscribeStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    return this.socket.onStatus(cb);
  }
}

function decimalsOf(step: string | undefined): number {
  if (!step) return 2;
  const v = parseFloat(step);
  if (v >= 1) return 0;
  return Math.min(8, Math.round(-Math.log10(v)));
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}
