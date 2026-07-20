"use client";

import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtPercent, fmtPrice, fmtSigned } from "@/lib/terminal-app/lib/format";
import { useTrading } from "@/lib/terminal-app/stores/trading";

export function Positions() {
  const positions = useTrading((s) => s.positions);
  const marks = useTrading((s) => s.marks);
  const orders = useTrading((s) => s.orders);
  const closePosition = useTrading((s) => s.closePosition);
  const cancelOrder = useTrading((s) => s.cancelOrder);

  const open = Object.values(positions).filter((p) => p.qty !== 0);
  const working = orders.filter((o) => o.status === "open");

  let totalUnrealized = 0;
  let totalRealized = 0;
  for (const p of Object.values(positions)) {
    totalRealized += p.realizedPnl;
    const mark = marks[p.symbol];
    if (mark !== undefined && p.qty !== 0) {
      totalUnrealized += (mark - p.avgPrice) * p.qty;
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="grid grid-cols-2 gap-px border-b border-edge bg-edge">
        <Stat label="Unrealized" value={totalUnrealized} />
        <Stat label="Realized" value={totalRealized} />
      </div>

      <SectionHeader>Positions</SectionHeader>
      {open.length === 0 ? (
        <EmptyState message="No open positions" hint="Fill an order from the Trade tab" />
      ) : (
        open.map((p) => {
          const mark = marks[p.symbol];
          const upnl = mark !== undefined ? (mark - p.avgPrice) * p.qty : 0;
          const upnlPct =
            p.avgPrice !== 0 && mark !== undefined
              ? ((mark - p.avgPrice) / p.avgPrice) * 100 * Math.sign(p.qty)
              : 0;
          return (
            <div key={p.symbol} className="border-b border-edge px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="num text-xs font-medium text-hi">{p.symbol}</span>
                <span
                  className={cn(
                    "num rounded px-1 text-2xs",
                    p.qty > 0 ? "bg-up-muted text-up" : "bg-down-muted text-down",
                  )}
                >
                  {p.qty > 0 ? "LONG" : "SHORT"} {Math.abs(p.qty)}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 text-2xs">
                <Cell label="Entry" value={fmtPrice(p.avgPrice)} />
                <Cell label="Mark" value={mark !== undefined ? fmtPrice(mark) : "—"} />
                <Cell
                  label="uPnL"
                  value={`${fmtSigned(upnl, 2)} (${fmtPercent(upnlPct)})`}
                  tone={upnl >= 0 ? "up" : "down"}
                />
              </div>
              <button
                type="button"
                className="mt-1.5 h-6 w-full rounded border border-edge text-2xs text-mid transition-colors duration-150 hover:border-edge-strong hover:bg-hover hover:text-hi"
                onClick={() => closePosition(p.symbol)}
              >
                Close at market
              </button>
            </div>
          );
        })
      )}

      <SectionHeader>Working orders</SectionHeader>
      {working.length === 0 ? (
        <EmptyState message="No working orders" hint="Limit orders rest here until filled" />
      ) : (
        working.map((o) => (
          <div key={o.id} className="flex items-center justify-between border-b border-edge px-2 py-1.5">
            <div className="flex flex-col">
              <span className="num text-2xs text-hi">
                <span className={o.side === "buy" ? "text-up" : "text-down"}>
                  {o.side.toUpperCase()}
                </span>{" "}
                {o.qty} {o.symbol}
              </span>
              <span className="num text-2xs text-low">@ {fmtPrice(o.price)}</span>
            </div>
            <button
              type="button"
              className="h-5 rounded border border-edge px-1.5 text-2xs text-mid transition-colors duration-150 hover:border-edge-strong hover:text-down"
              onClick={() => cancelOrder(o.id)}
            >
              Cancel
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-panel px-2 py-1.5">
      <div className="text-2xs text-low">{label}</div>
      <div className={cn("num text-xs", value >= 0 ? "text-up" : "text-down")}>
        {fmtSigned(value, 2)}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <div className="text-low">{label}</div>
      <div className={cn("num", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-mid")}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-edge bg-elevated px-2 py-1 text-2xs font-medium uppercase tracking-wider text-low">
      {children}
    </div>
  );
}

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-4">
      <span className="text-2xs text-mid">{message}</span>
      <span className="text-2xs text-low">{hint}</span>
    </div>
  );
}
