"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { fmtClock } from "@/lib/terminal-app/lib/format";
import { VirtualList } from "@/lib/terminal-app/components/ui/VirtualList";

/**
 * Protocol-wide on-chain activity from the event indexer.
 *
 * Distinct from Trade Log, which is this browser session's own orders and
 * fills. Everything here actually happened on-chain — launches, trades,
 * graduations, swaps and fee claims across every token — decoded from program
 * events by the indexer rather than inferred from price movement.
 */

const ROW_HEIGHT = 22;
const POLL_MS = 15_000;
const LIMIT = 200;

interface ActivityEvent {
  signature: string;
  kind: string;
  mint: string | null;
  actor: string | null;
  isBuy: boolean | null;
  sol: number | null;
  tokens: number | null;
  blockTime: number | null;
  token: { handle: string; symbol: string | null; name: string | null } | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; events: ActivityEvent[] }
  /** The indexer has no database configured — not the same as "nothing happened". */
  | { status: "unconfigured" }
  | { status: "error" };

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Colour by what the event did, not by which instruction produced it. */
function kindClass(e: ActivityEvent): string {
  if (e.kind === "trade" || e.kind === "swap") {
    return e.isBuy === false ? "bg-down-muted text-down" : "bg-up-muted text-up";
  }
  if (e.kind === "launch") return "bg-tacc-muted text-tacc";
  if (e.kind === "graduate") return "bg-warn-muted text-warn";
  return "bg-hover text-mid";
}

function label(e: ActivityEvent): string {
  if (e.kind === "trade" || e.kind === "swap") return e.isBuy === false ? "sell" : "buy";
  return e.kind;
}

export function NetworkActivity() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/activity?limit=${LIMIT}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { events?: ActivityEvent[]; reason?: string };
        if (cancelled) return;
        // Say so rather than showing an empty list that implies no activity.
        if (body.reason === "no-db") return setState({ status: "unconfigured" });
        setState({ status: "ready", events: body.events ?? [] });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex h-full flex-col gap-px overflow-hidden p-1" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2" style={{ height: ROW_HEIGHT }}>
            <div className="h-2.5 w-16 shrink-0 animate-pulse rounded bg-hover" />
            <div className="h-2.5 w-10 shrink-0 animate-pulse rounded bg-hover" />
            <div className="h-2.5 w-20 shrink-0 animate-pulse rounded bg-hover" />
            <div className="h-2.5 flex-1 animate-pulse rounded bg-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "unconfigured") {
    return (
      <Empty
        title="Indexer not configured"
        detail="Set DATABASE_URL to record on-chain events for this deployment."
      />
    );
  }

  if (state.status === "error") {
    return <Empty title="Couldn't load network activity" detail="The indexer didn't respond." />;
  }

  if (state.events.length === 0) {
    return (
      <Empty
        title="No on-chain activity yet"
        detail="Launches, trades and graduations across every token appear here."
      />
    );
  }

  return (
    <VirtualList
      items={state.events}
      rowHeight={ROW_HEIGHT}
      className="h-full"
      renderRow={(e) => (
        <div
          key={e.signature}
          style={{ height: ROW_HEIGHT }}
          className="flex items-center gap-3 border-b border-edge px-3"
        >
          <span className="num w-16 shrink-0 text-2xs text-low">
            {e.blockTime ? fmtClock(e.blockTime * 1000) : "—"}
          </span>
          <span
            className={cn(
              "w-12 shrink-0 rounded px-1 text-center text-2xs uppercase",
              kindClass(e),
            )}
          >
            {label(e)}
          </span>
          <span className="w-20 shrink-0 truncate text-2xs text-hi">
            {e.token?.symbol ?? e.token?.handle ?? (e.mint ? short(e.mint) : "—")}
          </span>
          <span className="num w-24 shrink-0 text-right text-2xs text-hi">
            {e.sol === null ? "—" : `${e.sol.toFixed(4)} SOL`}
          </span>
          <span className="num truncate text-2xs text-low">
            {e.actor ? short(e.actor) : ""}
          </span>
        </div>
      )}
    />
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <span className="text-2xs text-mid">{title}</span>
      <span className="text-2xs text-low">{detail}</span>
    </div>
  );
}
