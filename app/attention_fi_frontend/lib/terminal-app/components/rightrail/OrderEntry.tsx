"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtPrice } from "@/lib/terminal-app/lib/format";
import type { Side } from "@/lib/terminal-app/lib/types";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { useTrading, type OrderType } from "@/lib/terminal-app/stores/trading";
import { SET_ORDER_PRICE_EVENT, type OrderPrefill } from "./OrderBook";

export function OrderEntry() {
  const symbol = useSettings((s) => s.symbol);
  const mark = useTrading((s) => s.marks[symbol]);
  const placeOrder = useTrading((s) => s.placeOrder);
  const defaultQty = useTrading((s) => s.defaultQty);
  const setDefaultQty = useTrading((s) => s.setDefaultQty);

  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [qty, setQty] = useState(String(defaultQty));
  const [price, setPrice] = useState("");

  // clicking a book level pre-fills price + side (bid = buy, ask = sell)
  useEffect(() => {
    const onSetPrice = (e: Event) => {
      const prefill = (e as CustomEvent<OrderPrefill>).detail;
      setPrice(String(prefill.price));
      setSide(prefill.side);
      setType("limit");
    };
    window.addEventListener(SET_ORDER_PRICE_EVENT, onSetPrice);
    return () => window.removeEventListener(SET_ORDER_PRICE_EVENT, onSetPrice);
  }, []);

  // A price typed for one symbol means nothing for the next, so it clears on
  // switch. Adjusted during render rather than in an effect: the effect version
  // committed a render in which the new symbol was shown alongside the old
  // symbol's price — briefly offering a limit order at a price from a different
  // market.
  const [prevSymbol, setPrevSymbol] = useState(symbol);
  if (symbol !== prevSymbol) {
    setPrevSymbol(symbol);
    setPrice("");
  }

  const qtyNum = parseFloat(qty) || 0;
  const priceNum = type === "market" ? (mark ?? 0) : parseFloat(price) || 0;
  const notional = qtyNum * priceNum;
  const canSubmit = qtyNum > 0 && priceNum > 0;

  const submit = () => {
    if (!canSubmit) return;
    placeOrder({ symbol, side, type, qty: qtyNum, price: priceNum });
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-1 rounded border border-edge bg-tinput p-0.5">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={cn(
              "h-7 rounded-sm text-xs font-medium uppercase tracking-wide transition-colors duration-150",
              s === side
                ? s === "buy"
                  ? "bg-up-muted text-up"
                  : "bg-down-muted text-down"
                : "text-mid hover:bg-hover hover:text-hi",
            )}
            onClick={() => setSide(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded border border-edge bg-tinput p-0.5">
        {(["limit", "market"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              "h-6 rounded-sm text-2xs capitalize transition-colors duration-150",
              t === type ? "bg-tacc-muted text-tacc" : "text-mid hover:bg-hover hover:text-hi",
            )}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <Field label="Quantity (also used by hotkeys and DOM Alt+click)">
        <input
          type="number"
          min="0"
          step="any"
          value={qty}
          className="num h-7 w-full rounded border border-edge bg-tinput px-2 text-right text-xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
          onChange={(e) => {
            setQty(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v > 0) setDefaultQty(v);
          }}
        />
      </Field>

      {type === "limit" && (
        <Field label="Limit price">
          <input
            type="number"
            min="0"
            step="any"
            value={price}
            placeholder={mark !== undefined ? fmtPrice(mark) : ""}
            className="num h-7 w-full rounded border border-edge bg-tinput px-2 text-right text-xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
      )}

      <div className="num flex items-center justify-between text-2xs">
        <span className="text-low">Mark</span>
        <span className="text-mid">{mark !== undefined ? fmtPrice(mark) : "—"}</span>
      </div>
      <div className="num flex items-center justify-between text-2xs">
        <span className="text-low">Notional</span>
        <span className="text-mid">{notional > 0 ? fmtPrice(notional, 2) : "—"}</span>
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        className={cn(
          "h-8 rounded text-xs font-semibold uppercase tracking-wide text-white transition-opacity duration-150",
          side === "buy" ? "bg-up hover:opacity-90" : "bg-down hover:opacity-90",
        )}
        onClick={submit}
      >
        {side === "buy" ? "Buy" : "Sell"} {symbol}
      </button>

      <p className="text-2xs leading-4 text-low">
        Orders are simulated locally against the live feed. Limit orders fill
        when the mark price crosses the limit.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-low">{label}</span>
      {children}
    </label>
  );
}
