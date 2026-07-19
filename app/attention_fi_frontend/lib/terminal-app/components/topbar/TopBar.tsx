"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useSolBalance } from "@/lib/solana/use-sol-balance";
import { cn } from "@/lib/terminal-app/lib/cn";
import { useProvider } from "@/lib/terminal-app/lib/providers";
import { TIMEFRAMES, type ChartType, type ConnectionStatus } from "@/lib/terminal-app/lib/types";
import { useLayout } from "@/lib/terminal-app/stores/layout";
import { useSettings, type GridLayout } from "@/lib/terminal-app/stores/settings";
import { Select } from "@/lib/terminal-app/components/ui/Select";
import { Tooltip } from "@/lib/terminal-app/components/ui/Tooltip";
import { IndicatorMenu } from "./IndicatorMenu";
import { DrawingToolsMenu } from "./DrawingToolsMenu";
import { SymbolSearch } from "./SymbolSearch";

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "candles", label: "Candles" },
  { value: "heikin-ashi", label: "Heikin-Ashi" },
  { value: "hollow", label: "Hollow" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "bars", label: "Bars" },
];

const GRID_LAYOUTS: { value: GridLayout; label: string }[] = [
  { value: "1", label: "Single" },
  { value: "2h", label: "2 × Horizontal" },
  { value: "2v", label: "2 × Vertical" },
  { value: "4", label: "4 Grid" },
];

export function TopBar() {
  const tf = useSettings((s) => s.timeframe);
  const setTf = useSettings((s) => s.setTimeframe);
  const chartType = useSettings((s) => s.chartType);
  const setChartType = useSettings((s) => s.setChartType);
  const priceScale = useSettings((s) => s.priceScale);
  const setPriceScale = useSettings((s) => s.setPriceScale);
  const gridLayout = useSettings((s) => s.gridLayout);
  const setGridLayout = useSettings((s) => s.setGridLayout);
  const syncCrosshair = useSettings((s) => s.syncCrosshair);
  const setSyncCrosshair = useSettings((s) => s.setSyncCrosshair);
  const theme = useSettings((s) => s.theme);
  const toggleTheme = useSettings((s) => s.toggleTheme);
  const providerKind = useSettings((s) => s.provider);
  const setProvider = useSettings((s) => s.setProvider);

  const toggleLeft = useLayout((s) => s.toggleLeft);
  const toggleRight = useLayout((s) => s.toggleRight);
  const toggleDrawer = useLayout((s) => s.toggleDrawer);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-edge bg-panel px-2">
      <Link
        href="/"
        title="Back to AttentionFi"
        className="flex shrink-0 items-center gap-1.5 px-1 transition-opacity duration-150 hover:opacity-80"
      >
        <span className="text-sm font-bold tracking-tight text-hi">
          ATTENTION<span style={{ color: "var(--tk-up-alert)" }}>FI</span>
        </span>
        <span className="rounded-sm border border-edge bg-elevated px-1 py-px text-2xs uppercase tracking-wider text-mid">
          Terminal
        </span>
      </Link>
      <SymbolSearch />

      <div className="flex items-center rounded border border-edge bg-tinput p-0.5">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              "num rounded-sm px-1.5 py-0.5 text-2xs uppercase",
              "transition-colors duration-150",
              t === tf ? "bg-tacc-muted text-tacc" : "text-mid hover:bg-hover hover:text-hi",
            )}
            onClick={() => setTf(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <Select value={chartType} options={CHART_TYPES} onChange={setChartType} />
      <IndicatorMenu />
      <DrawingToolsMenu />

      <div className="flex items-center rounded border border-edge bg-tinput p-0.5">
        {(["linear", "log", "percent"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-2xs capitalize transition-colors duration-150",
              m === priceScale
                ? "bg-tacc-muted text-tacc"
                : "text-mid hover:bg-hover hover:text-hi",
            )}
            onClick={() => setPriceScale(m)}
          >
            {m === "percent" ? "%" : m}
          </button>
        ))}
      </div>

      <Select value={gridLayout} options={GRID_LAYOUTS} onChange={setGridLayout} />
      {gridLayout !== "1" && (
        <Tooltip label="Sync crosshair and symbol across panes">
          <button
            type="button"
            className={cn(
              "h-6 rounded border px-2 text-2xs transition-colors duration-150",
              syncCrosshair
                ? "border-focus bg-tacc-muted text-tacc"
                : "border-edge bg-tinput text-mid hover:bg-hover hover:text-hi",
            )}
            onClick={() => setSyncCrosshair(!syncCrosshair)}
          >
            Sync
          </button>
        </Tooltip>
      )}

      <div className="flex-1" />

      <Tooltip label="Cycle data source: AttentionFi devnet → Binance → offline mock">
        <button
          type="button"
          className="h-6 rounded border border-edge bg-tinput px-2 text-2xs uppercase text-mid transition-colors duration-150 hover:bg-hover hover:text-hi"
          onClick={() =>
            setProvider(
              providerKind === "attentionfi"
                ? "binance"
                : providerKind === "binance"
                  ? "mock"
                  : "attentionfi",
            )
          }
        >
          {providerKind}
        </button>
      </Tooltip>

      <div className="flex items-center gap-1">
        <PanelToggle label="Toggle watchlist" onClick={toggleLeft} glyph="left" />
        <PanelToggle label="Toggle bottom drawer" onClick={toggleDrawer} glyph="bottom" />
        <PanelToggle label="Toggle right rail" onClick={toggleRight} glyph="right" />
      </div>

      <Tooltip label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded border border-edge bg-tinput text-mid transition-colors duration-150 hover:bg-hover hover:text-hi"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </Tooltip>

      <WalletCluster />
      <StatusLed />
    </header>
  );
}

/** Wallet connect/menu plus the connected wallet's SOL balance. */
function WalletCluster() {
  const { connected } = useWallet();
  const sol = useSolBalance();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {connected && sol !== null && (
        <span
          className="num rounded border border-edge bg-tinput px-2 py-1 text-2xs text-mid"
          title="Wallet SOL balance (devnet)"
        >
          {sol.toFixed(3)} SOL
        </span>
      )}
      <WalletButton />
    </div>
  );
}

function PanelToggle({
  label,
  onClick,
  glyph,
}: {
  label: string;
  onClick: () => void;
  glyph: "left" | "right" | "bottom";
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded border border-edge bg-tinput text-mid transition-colors duration-150 hover:bg-hover hover:text-hi"
        onClick={onClick}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" fill="none" strokeWidth="1.1" />
          {glyph === "left" && <rect x="1" y="1" width="4" height="10" rx="1.5" fill="currentColor" opacity="0.6" />}
          {glyph === "right" && <rect x="7" y="1" width="4" height="10" rx="1.5" fill="currentColor" opacity="0.6" />}
          {glyph === "bottom" && <rect x="1" y="7" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.6" />}
        </svg>
      </button>
    </Tooltip>
  );
}

function StatusLed() {
  const provider = useProvider();
  const [status, setStatus] = useState<ConnectionStatus>("down");
  useEffect(() => provider.subscribeStatus(setStatus), [provider]);
  const label =
    status === "live" ? "Feed connected" : status === "connecting" ? "Connecting…" : "Feed idle";
  return (
    <Tooltip label={label}>
      <span className="flex h-6 w-6 items-center justify-center">
        <span
          className={cn(
            "led",
            status === "live" && "led-live",
            status === "connecting" && "led-connecting",
            status === "down" && "led-down",
          )}
        />
      </span>
    </Tooltip>
  );
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.1" fill="none" />
      <g stroke="currentColor" strokeWidth="1.1">
        <path d="M6 0.5v1.5M6 10v1.5M0.5 6h1.5M10 6h1.5M2.2 2.2l1 1M8.8 8.8l1 1M9.8 2.2l-1 1M3.2 8.8l-1 1" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M10 7.5A4.5 4.5 0 0 1 4.5 2 4.5 4.5 0 1 0 10 7.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}
