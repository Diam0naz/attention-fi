export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

/** time is a unix timestamp in seconds (bar open time) */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Tick {
  symbol: string;
  price: number;
  qty: number;
  time: number; // ms
  /** true when the aggressor was a seller (downtick) */
  isSellerMaker: boolean;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[]; // sorted desc by price
  asks: OrderBookLevel[]; // sorted asc by price
  time: number; // ms
}

export interface SymbolMeta {
  symbol: string;
  base: string;
  quote: string;
  description: string;
  pricePrecision: number;
  qtyPrecision: number;
}

export interface TickerStats {
  symbol: string;
  last: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}

export type Unsubscribe = () => void;

export type ConnectionStatus = "live" | "connecting" | "down";

export interface MarketDataProvider {
  readonly name: string;
  getCandles(
    symbol: string,
    tf: Timeframe,
    from: number,
    to: number,
  ): Promise<Candle[]>;
  subscribeTicks(symbol: string, cb: (t: Tick) => void): Unsubscribe;
  subscribeCandles(
    symbol: string,
    tf: Timeframe,
    cb: (c: Candle) => void,
  ): Unsubscribe;
  getOrderBook(symbol: string, depth: number): Promise<OrderBook>;
  subscribeOrderBook(
    symbol: string,
    depth: number,
    cb: (b: OrderBook) => void,
  ): Unsubscribe;
  searchSymbols(query: string): Promise<SymbolMeta[]>;
  getTickerStats(symbols?: string[]): Promise<TickerStats[]>;
  subscribeStatus(cb: (s: ConnectionStatus) => void): Unsubscribe;
}

export type ChartType =
  | "candles"
  | "heikin-ashi"
  | "hollow"
  | "line"
  | "area"
  | "bars";

export type PriceScaleMode = "linear" | "log" | "percent";

export type Side = "buy" | "sell";
