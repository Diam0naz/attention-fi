"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useWallet } from "@/components/wallet/wallet-provider";
import { explorerTx } from "@/lib/solana/config";
import { fetchGlobal } from "@/lib/solana/curve";
import { handleToMint } from "@/lib/solana/registry";
import {
  graduateToken,
  graduationOutlook,
  resolveVenue,
  tradeOnVenue,
  venueQuote,
  venueSpot,
  type Venue,
} from "@/lib/solana/venue";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { useSolBalance } from "@/lib/solana/use-sol-balance";
import { useTokenBalance } from "@/lib/solana/use-token-balance";
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

// Global config (fees, decimals) never changes after init — fetch it once per
// session instead of on every quote poll; the public devnet RPC rate-limits.
let globalOnce: ReturnType<typeof fetchGlobal> | null = null;
function getGlobalOnce(program: Parameters<typeof fetchGlobal>[0]) {
  globalOnce ??= fetchGlobal(program);
  return globalOnce;
}

/**
 * Real order ticket against the AttentionFi bonding curve on devnet.
 * Buys are denominated in SOL in, sells in tokens in — mirroring the
 * program's buy/sell instructions. Quotes are estimates from current
 * reserves; the transaction carries slippage-protected minimums.
 */
/** Quick-size fractions of the available balance. */
const SIZE_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

/** Left unspent when sizing a buy off the SOL balance, for fees and rent. */
const GAS_RESERVE_SOL = 0.01;

/**
 * Format a computed size for the amount input.
 *
 * Trimmed rather than rounded to a fixed precision: rounding up could ask to
 * spend more than the wallet holds, and a trailing-zero string in a number
 * input reads as sloppy. 9 places covers lamport precision without notation.
 */
function fmtAmount(n: number): string {
  if (n <= 0) return "0";
  return Number(n.toFixed(9)).toString();
}

export function AttentionOrderEntry() {
  const symbol = useSettings((s) => s.symbol);
  const { connected, address } = useWallet();
  const program = useProgram();
  const readonly = useReadonlyProgram();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [decimals, setDecimals] = useState(6);
  const [feeBps, setFeeBps] = useState(100);
  const [graduationLamports, setGraduationLamports] = useState(0n);
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [walletModal, setWalletModal] = useState(false);

  const mint = handleToMint(symbol);
  const tokenBalance = useTokenBalance(mint?.toBase58() ?? "");
  const solBalance = useSolBalance();

  // Switching market invalidates both the quote and any transaction result
  // still on screen. Cleared during render so there is no frame in which the
  // new symbol is shown next to the old market's reserves — the number the
  // trader would be sizing an order against.
  const [prevSymbol, setPrevSymbol] = useState(symbol);
  if (symbol !== prevSymbol) {
    setPrevSymbol(symbol);
    setVenue(null);
    setTx({ kind: "idle" });
  }

  // keep the quote fresh while the ticket is open
  useEffect(() => {
    if (!mint) return;
    let cancelled = false;
    const load = async () => {
      const [v, g] = await Promise.all([resolveVenue(readonly, mint), getGlobalOnce(readonly)]);
      if (cancelled) return;
      if (v) setVenue(v);
      if (g) {
        setDecimals(g.tokenDecimals);
        setFeeBps(g.feeBps);
        setGraduationLamports(g.graduationSol);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
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

  // What a percentage button is a percentage *of*. Buying spends SOL, selling
  // spends tokens, so the two sides size against different balances.
  //
  // The buy side holds back GAS_RESERVE_SOL. "MAX" that spends the literal
  // whole balance leaves nothing for the transaction fee, so the trade it
  // offers is the one trade guaranteed to fail.
  const sizeBase =
    side === "buy"
      ? solBalance === null
        ? null
        : Math.max(0, solBalance - GAS_RESERVE_SOL)
      : tokenBalance;

  const amountNum = parseFloat(amount) || 0;
  const spot = venue ? venueSpot(venue, decimals) : 0;
  const estimate = venue ? venueQuote(venue, side, amountNum, decimals, feeBps) : 0;
  // Nothing trades between completion and migration, so the ticket becomes a
  // graduate button rather than a buy button that is certain to fail.
  const stranded = venue?.kind === "stranded";
  // Whether this order would tip the curve over its threshold. Surfaced before
  // submitting, since the crossing can't be undone by any later transaction.
  const outlook =
    venue && graduationLamports > 0n
      ? graduationOutlook(venue, side === "buy" ? amountNum : 0, graduationLamports, feeBps)
      : null;
  const wouldGraduate = side === "buy" && !stranded && outlook?.crosses === true;

  const canSubmit =
    connected && program !== null && venue !== null && !stranded && amountNum > 0 && tx.kind !== "pending";

  const submit = async () => {
    if (!program || !address || !mint) return;
    setTx({ kind: "pending" });
    try {
      const trader = new PublicKey(address);
      const sig = await tradeOnVenue(program, trader, mint, side, amountNum, decimals, slippageBps);
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

  const graduate = async () => {
    if (!program || !address || !mint) return;
    setTx({ kind: "pending" });
    try {
      const sig = await graduateToken(program, new PublicKey(address), mint);
      setTx({ kind: "success", sig });
      useTrading
        .getState()
        .appendLog("alert", `${symbol} migrated to its AMM pool (${sig.slice(0, 8)}…)`);
      const next = await resolveVenue(readonly, mint);
      if (next) setVenue(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Graduation failed";
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
            !venue || stranded ? "bg-warn-muted text-warn" : "bg-up-muted text-up",
          )}
        >
          {!venue
            ? "loading venue…"
            : venue.kind === "pool"
              ? "amm pool · devnet"
              : stranded
                ? "awaiting migration"
                : "curve · devnet"}
        </span>
      </div>

      {stranded && (
        <div className="rounded border border-warn/40 bg-warn-muted p-2">
          <p className="text-2xs leading-4 text-warn">
            This token hit its graduation threshold, so the curve has stopped
            trading — and its AMM pool doesn&apos;t exist yet, so nothing else
            has picked it up. Until the migration runs it can&apos;t be bought or
            sold at all.
          </p>
          <p className="mt-1 text-2xs leading-4 text-mid">
            Anyone can run it, including you. It moves the curve&apos;s SOL and
            remaining tokens into the pool; it doesn&apos;t take a cut and
            doesn&apos;t need the creator.
          </p>
          <button
            type="button"
            disabled={!connected || !program || tx.kind === "pending"}
            className="mt-2 h-7 w-full rounded bg-warn text-2xs font-semibold uppercase tracking-wide text-black transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
            onClick={() => void graduate()}
          >
            {tx.kind === "pending"
              ? "Confirm in wallet…"
              : connected
                ? "Run migration"
                : "Connect wallet to migrate"}
          </button>
        </div>
      )}

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
        <div className="flex items-baseline justify-between">
          <span className="text-2xs text-low">
            {side === "buy" ? "Spend (SOL)" : "Sell (tokens)"}
          </span>
          {sizeBase !== null && (
            <button
              type="button"
              onClick={() => setAmount(fmtAmount(sizeBase))}
              className="num text-2xs text-low transition-colors duration-150 hover:text-hi"
              title={side === "buy" ? "Spend your whole balance less gas" : "Sell everything"}
            >
              {side === "buy" ? "Avail" : "Held"} {fmtQty(sizeBase)}
            </button>
          )}
        </div>
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          className="num h-7 w-full rounded border border-edge bg-tinput px-2 text-right text-xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
          onChange={(e) => setAmount(e.target.value)}
        />
        {sizeBase !== null && sizeBase > 0 && (
          <div className="mt-0.5 flex items-center gap-1">
            {SIZE_FRACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAmount(fmtAmount(sizeBase * f))}
                className="num flex-1 rounded border border-edge py-0.5 text-2xs text-mid transition-colors duration-150 hover:border-focus hover:text-hi"
              >
                {f === 1 ? "MAX" : `${f * 100}%`}
              </button>
            ))}
          </div>
        )}
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

      {outlook && !stranded && (
        <div className="num flex items-center justify-between text-2xs">
          <span className="text-low">To graduation</span>
          <span className={wouldGraduate ? "text-down" : "text-mid"}>
            {outlook.reservesSol.toFixed(1)}/{outlook.thresholdSol.toFixed(0)} SOL
          </span>
        </div>
      )}

      {/* Before the order, not after. The instruction that crosses the
          threshold also closes the curve — to buys and to sells — and no later
          transaction can reopen it. */}
      {wouldGraduate && (
        <div className="rounded border border-down/40 bg-down-muted p-2">
          <p className="text-2xs leading-4 text-down">
            This buy graduates @{symbol}. The curve closes on the spot — no more
            buys, no more sells — until the AMM migration is run.
          </p>
          <p className="mt-1 text-2xs leading-4 text-mid">
            Anyone can run the migration straight after, including you. There is
            no way back to the curve. Keep the order under{" "}
            {outlook!.remainingSol.toFixed(3)} SOL to leave it trading.
          </p>
        </div>
      )}

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
          {tx.kind === "pending"
            ? "Confirm in wallet…"
            : wouldGraduate
              ? "buy & graduate"
              : `${side} on-chain`}
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
        {venue?.kind === "pool"
          ? "This token has graduated — trades execute against its constant-product AMM pool on devnet. Quotes are net of the swap fee, which stays in the pool. The instruction enforces your slippage minimum."
          : "Trades execute against the bonding curve program on devnet. Estimates use current reserves; the instruction enforces your slippage minimum."}
      </p>
      <WalletConnectModal open={walletModal} onClose={() => setWalletModal(false)} />
    </div>
  );
}
