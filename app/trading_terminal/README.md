# Terminal

A browser-based trading terminal: TradingView-class charting, live market data,
simulated trading, and a keyboard-first workflow — built as a standalone
Next.js app.

```
npm install
npm run dev        # http://localhost:3100
npm run build      # production build
npm run typecheck  # tsc --noEmit (strict)
```

No API keys required. The default data source is Binance's public REST +
WebSocket API; switch to the deterministic offline mock provider from the top
bar (the `BINANCE` / `MOCK` button) or the command palette — the entire
terminal works with no network access.

## Stack

| Concern        | Choice                                          |
| -------------- | ----------------------------------------------- |
| Framework      | Next.js 15 (App Router), TypeScript strict      |
| Chart canvas   | lightweight-charts 4.2 (TradingView OSS engine) |
| State          | Zustand (persisted slices per domain)           |
| Data lifecycle | TanStack Query (REST) + raw WebSocket (ticks)   |
| Workspace grid | react-resizable-panels                          |
| Styling        | Tailwind CSS v4 over a custom token layer       |

## Architecture

### Design tokens

All colors, type, and motion flow from CSS custom properties in
[`src/app/globals.css`](src/app/globals.css). Raw values live on `:root`
(dark, the primary theme) and `.light`; Tailwind utilities are generated from
semantic aliases (`bg-panel`, `text-up`, `border-edge`, …) via `@theme inline`,
so components never hardcode hex values. Charts read the same tokens at
runtime (`src/lib/chart/theme.ts`) so a theme flip restyles the canvas too.
Direction colors are desaturated for long sessions; full saturation appears
only in fired-alert UI. Every numeric cell uses the `.num` class → monospace
tabular figures, so ticking values never shift horizontally.

### State

One Zustand store per domain in `src/stores/`:

- `settings` — symbol, timeframe, chart type, price-scale mode, grid layout,
  theme, provider. Persisted.
- `layout` — rail/drawer collapse + active tabs. Panel *sizes* are persisted
  separately by react-resizable-panels (`autoSaveId`).
- `watchlist` — multiple named lists, sort state.
- `indicators` — indicator instances with params/colors/widths/visibility.
- `drawings` — drawings keyed by symbol, active tool, selection, and
  symbol-scoped undo/redo stacks (capped at 64 entries).
- `trading` — simulated orders, positions (weighted-average entry, realized
  PnL on reduce/flip), mark prices, activity log. Limit orders fill when the
  live mark crosses the price.
- `alerts` — price-cross alerts; triggers surface as a toast and log entry.

### Data layer

`MarketDataProvider` (`src/lib/types.ts`) is the seam:

```ts
interface MarketDataProvider {
  getCandles(symbol, tf, from, to): Promise<Candle[]>;
  subscribeCandles(symbol, tf, cb): Unsubscribe;
  subscribeTicks(symbol, cb): Unsubscribe;
  getOrderBook(symbol, depth): Promise<OrderBook>;
  subscribeOrderBook(symbol, depth, cb): Unsubscribe;
  searchSymbols(query): Promise<SymbolMeta[]>;
  getTickerStats(symbols?): Promise<TickerStats[]>;
  subscribeStatus(cb): Unsubscribe;
}
```

Two implementations ship:

- **`BinanceProvider`** (`src/lib/providers/binance.ts`) — REST backfill plus
  one multiplexed WebSocket for the whole app. Streams are refcounted
  (SUBSCRIBE on first listener, UNSUBSCRIBE on last), with exponential-backoff
  reconnect and automatic resubscription. Connection state drives the top-bar
  LED.
- **`MockProvider`** (`src/lib/providers/mock.ts`) — geometric Brownian motion
  with a log-OU volatility process (volatility clustering), seeded per
  (symbol, timeframe) with mulberry32, so history is reproducible within a
  session and consistent across panels. Synthesizes candles, ticks, books, and
  24h stats for ten symbols, fully offline.

**Adding a provider:** implement the interface, register it in
`src/lib/providers/index.ts`, and add the kind to `ProviderKind` in
`src/stores/settings.ts`. Everything downstream (charts, book, tape,
watchlist, screener, fills, alerts) is provider-agnostic.

### Chart engine

`CandleFeed` (`src/lib/chart/feed.ts`) owns the candle array per
(symbol, timeframe): initial 500-bar load, left-edge backfill pages of 500,
live bar merge. Consumers subscribe to `"history"` / `"live"` events and
mutate lightweight-charts series **imperatively** — candle data never passes
through React state, so ticks cost zero React renders.

`ChartWorkspace` renders the primary `ChartPane` plus one `SubPane` per
active oscillator inside a vertical `PanelGroup` (independent height handles).
Each pane is its own lightweight-charts instance; a small pub/sub keeps
logical ranges and crosshairs bidirectionally synced (`setCrosshairPosition`).
A second, global bus (`src/lib/chart/sync.ts`) does the same across grid
panes when Sync is enabled in a 2/4-chart layout.

Details worth knowing:

- Heikin-Ashi is recomputed incrementally on live bars (only the trailing bar).
- Overlay indicator recomputes are rAF-throttled to ~3/s during tick bursts.
- Infinite scroll triggers when the visible logical range enters the first 60
  bars; in-flight and exhausted states are guarded in the feed.
- The countdown-to-close badge and the OHLCV legend are DOM nodes mutated
  directly (no re-render), positioned via `priceToCoordinate`.
- Open limit orders and the position's average entry render as price lines on
  the primary pane.
- VWAP is anchored to the first loaded bar (crypto has no session boundary);
  the anchor moves as history backfills.

### Drawings

`DrawingLayer` is a DPR-aware canvas overlay on the primary pane. Geometry
lives in chart space (`{time, price}`) and is projected through the chart's
coordinate APIs each paint, so drawings track pan/zoom exactly. Pointer events
are intercepted in the capture phase only when a tool is armed or a drawing is
hit — otherwise the chart pans normally. Tools: trendline, ray, horizontal /
vertical line, rectangle, Fibonacci retracement + extension, text (inline
edit on double-click), and measure. Selection shows drag handles and a
floating style toolbar (color / width / dash / delete). All mutations go
through the store's history stack: Ctrl+Z / Ctrl+Shift+Z, per symbol,
persisted to localStorage.

### Performance practices

- Tick → chart via imperative series `update()`; no React involvement.
- Order book and tape buffer updates in refs and flush at most once per
  animation frame.
- Tape and screener rows are windowed (`VirtualList`, fixed row height).
- Sparklines are tiny canvases, redrawn only when their 5-minute query
  refreshes.
- Skeleton placeholders (book, screener) match final row geometry; the chart
  keeps last-known data during reconnects rather than blanking.

### Indicators

Overlays: SMA, EMA, WMA, VWMA, HMA, DEMA, TEMA, KAMA, ALMA, ZLEMA, VWAP,
Bollinger Bands, Donchian Channels, SuperTrend, Ichimoku Cloud, Parabolic
SAR. Sub-panes: RSI, MACD, Stochastic, ATR, OBV, Volume.

Most render as ordinary line series from the registry. Two need custom
painting (lightweight-charts v4 has no band-fill or scatter series):
`IndicatorPaintLayer` is a passive canvas over the chart that fills the
Ichimoku cloud (bull/bear tinted, split at Senkou crossovers, displaced
forward past the last bar) and draws SAR dots sized to the current bar
spacing. SuperTrend emits NaN sentinels at trend flips which the series
mapper converts to whitespace, so up/down segments never bridge.

## Keyboard

`/` symbol search · `1–7` timeframes · `Alt+T` trendline · `Alt+H` horizontal
line · `Alt+F` fib retracement · `Esc` cancel/deselect · `Del` delete
drawing · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Ctrl+K` command palette ·
`Space` crosshair lock · `?` shortcut overlay.

Hotkey trading (active symbol, shared default quantity): `Shift+B` buy
market · `Shift+S` sell market · `Shift+F` flatten · `Shift+X` cancel all
working orders. In the order book, clicking a bid/ask preps a buy/sell limit
at that level; `Alt+click` places it instantly.

## Fonts

Font stacks are declared in CSS (`Inter Tight` → system grotesque,
`JetBrains Mono` → `ui-monospace`) with `tabular-nums` enforced globally.
There is deliberately no build-time font download, so builds are
network-independent; install the two fonts locally (or add `next/font/local`
with committed woff2 files) for the exact intended rendering.

## Deferred (explicitly, per the brief)

Deliberately not shipped rather than stubbed: Renko/Kagi/P&F/line-break/
volume-candle series; the remaining long-tail indicators (the registry in
`src/lib/indicators/registry.ts` is the extension point — an indicator is a
param schema + pure compute function; band fills and dot rendering go through
`IndicatorPaintLayer`); bar-replay mode; volume profile; a Pine-like
scripting sandbox and backtester; golden-layout tear-off/docking (the grid is
fixed-region but fully resizable/collapsible/persisted); pattern/Elliott
drawing objects and an object tree; bracket/OCO/trailing order types; alert
conditions on indicator plots (price-cross alerts only); multi-timeframe
indicators; heatmap view.
