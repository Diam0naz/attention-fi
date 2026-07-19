"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useWallet } from "@/components/wallet/wallet-provider";
import { explorerTx } from "@/lib/solana/config";
import {
  fetchCurve,
  fetchGlobal,
  quoteBuy,
  quoteSell,
  spotPriceSol,
  type CurveState,
} from "@/lib/solana/curve";
import { handleToMint } from "@/lib/solana/registry";
import { buyTokens, sellTokens } from "@/lib/solana/trade";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtPrice, fmtQty } from "@/lib/terminal-app/lib/format";
import { useSettings } from "@/lib/terminal-app/stores/settings";
import { useTrading } from "@/lib/terminal-app/stores/trading";

type TxState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; sig: string }
  | { kind: "error"; message: string };

const SLIPPAGE_OPTIONS = [50, 100, 200] as const;

/**
 * Real order ticket against the AttentionFi bonding curve on devnet.
 * Buys are denominated in SOL in, sells in tokens in — mirroring the
 * program's buy/sell instructions. Quotes are estimates from current
 * reserves; the transaction carries slippage-protected minimums.
 */
export function AttentionOrderEntry() {
  const symbol = useSettings((s) => s.symbol);
  const { connected, address } = useWallet();
  const program = useProgram();
  const readonly = useReadonlyProgram();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [curve, setCurve] = useState<CurveState | null>(null);
  const [decimals, setDecimals] = useState(6);
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [walletModal, setWalletModal] = useState(false);

  const mint = handleToMint(symbol);

  // keep the quote fresh while the ticket is open
  useEffect(() => {
    setCurve(null);
    setTx({ kind: "idle" });
    if (!mint) return;
    let cancelled = false;
    const load = async () => {
      const [c, g] = await Promise.all([fetchCurve(readonly, mint), fetchGlobal(readonly)]);
      if (cancelled) return;
      if (c) setCurve(c);
      if (g) setDecimals(g.tokenDecimals);
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, readonly]);

  if (!mint) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
        <span className="text-xs text-mid">@{symbol} isn&apos;t a live AttentionFi token</span>
        <span className="text-2xs text-low">
          Pick a launched token from the watchlist, or launch one from /launch
        </span>
      </div>
    );
  }

  const amountNum = parseFloat(amount) || 0;
  const spot = curve ? spotPriceSol(curve, decimals) : 0;
  const estimate =
    curve && amountNum > 0
      ? side === "buy"
        ? quoteBuy(curve, amountNum) / 10 ** decimals // tokens out
        : quoteSell(curve, amountNum * 10 ** decimals) // SOL out
      : 0;

  const canSubmit =
    connected && program !== null && curve !== null && amountNum > 0 && tx.kind !== "pending";

  const submit = async () => {
    if (!program || !address || !mint) return;
    setTx({ kind: "pending" });
    try {
      const buyer = new PublicKey(address);
      const sig =
        side === "buy"
          ? await buyTokens(program, buyer, mint, amountNum, slippageBps)
          : await sellTokens(program, buyer, mint, amountNum, decimals, slippageBps);
      setTx({ kind: "success", sig });
      useTrading
        .getState()
        .appendLog(
          "fill",
          `${side.toUpperCase()} ${symbol} on-chain: ${
            side === "buy" ? `${amountNum} SOL in` : `${amountNum} tokens in`
          } (${sig.slice(0, 8)}…)`,
        );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setTx({ kind: "error", message });
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <span className="num text-xs font-medium text-hi">@{symbol}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-2xs uppercase",
            curve ? "bg-up-muted text-up" : "bg-warn-muted text-warn",
          )}
        >
          {curve ? (curve.complete ? "graduated" : "live · devnet") : "loading curve…"}
        </span>
      </div>

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
            onClick={() => {
              setSide(s);
              setTx({ kind: "idle" });
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-2xs text-low">
          {side === "buy" ? "Spend (SOL)" : "Sell (tokens)"}
        </span>
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          className="num h-7 w-full rounded border border-edge bg-tinput px-2 text-right text-xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-2xs text-low">Slippage</span>
        <div className="flex items-center rounded border border-edge bg-tinput p-0.5">
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              className={cn(
                "num rounded-sm px-1.5 py-0.5 text-2xs transition-colors duration-150",
                bps === slippageBps
                  ? "bg-tacc-muted text-tacc"
                  : "text-mid hover:bg-hover hover:text-hi",
              )}
              onClick={() => setSlippageBps(bps)}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="num flex items-center justify-between text-2xs">
        <span className="text-low">Spot</span>
        <span className="text-mid">{spot > 0 ? `${fmtPrice(spot)} SOL` : "—"}</span>
      </div>
      <div className="num flex items-center justify-between text-2xs">
        <span className="text-low">Est. {side === "buy" ? "tokens out" : "SOL out"}</span>
        <span className="text-mid">
          {estimate > 0 ? (side === "buy" ? fmtQty(estimate) : fmtPrice(estimate)) : "—"}
        </span>
      </div>

      {connected ? (
        <button
          type="button"
          disabled={!canSubmit}
          className={cn(
            "h-8 rounded text-xs font-semibold uppercase tracking-wide text-white transition-opacity duration-150",
            side === "buy" ? "bg-up hover:opacity-90" : "bg-down hover:opacity-90",
          )}
          onClick={() => void submit()}
        >
          {tx.kind === "pending" ? "Confirm in wallet…" : `${side} on-chain`}
        </button>
      ) : (
        <button
          type="button"
          className="h-8 rounded border border-focus bg-tacc-muted text-xs font-medium text-tacc transition-colors duration-150 hover:bg-hover"
          onClick={() => setWalletModal(true)}
        >
          Connect wallet to trade
        </button>
      )}

      {tx.kind === "success" && (
        <a
          href={explorerTx(tx.sig)}
          target="_blank"
          rel="noreferrer"
          className="num truncate text-2xs text-up underline-offset-2 hover:underline"
        >
          Confirmed: {tx.sig.slice(0, 20)}… ↗
        </a>
      )}
      {tx.kind === "error" && (
        <p className="text-2xs leading-4 text-down">{tx.message}</p>
      )}

      <p className="text-2xs leading-4 text-low">
        Trades execute against the bonding curve program on devnet. Estimates
        use current reserves; the instruction enforces your slippage minimum.
      </p>
      <WalletConnectModal open={walletModal} onClose={() => setWalletModal(false)} />
    </div>
  );
}
