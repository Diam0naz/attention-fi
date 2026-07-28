"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Monitor } from "lucide-react";

/**
 * The terminal is a fully client-side surface: charts, websockets and
 * localStorage-persisted stores have no meaningful server render. Skipping SSR
 * avoids hydration mismatches with persisted state.
 */
const Terminal = dynamic(() => import("./Terminal").then((m) => m.Terminal), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="text-xs text-low">Loading terminal…</div>
    </div>
  ),
});

// The terminal's layout assumes a wide viewport — multi-pane charts, a right
// rail and a watchlist that can't collapse into a phone without a redesign.
const MIN_WIDTH_PX = 1024;
const QUERY = `(min-width: ${MIN_WIDTH_PX}px)`;

/**
 * Viewport check via useSyncExternalStore rather than an effect, so there's no
 * committed render on the wrong surface. Assumes desktop on the server: the
 * terminal is ssr:false, so the server only ever emits the loading shell.
 */
function useIsDesktop(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}

function DesktopOnlyNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6 text-center">
      <div className="w-full max-w-sm rounded-sm border border-white/[0.1] bg-[#0f1620] p-7">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-signal/30 bg-signal/[0.06]">
          <Monitor className="h-5 w-5 text-signal" />
        </div>

        <h1 className="mt-4 text-[16px] font-bold text-[#F5F4F0]">Built for a bigger screen</h1>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-[#6B6B6B]">
          The trading terminal runs multi-pane charts, an order book and a
          watchlist side by side. That doesn&apos;t fold down onto a phone
          honestly — so rather than ship a cramped version, we&apos;d rather you
          saw it properly. Open this page on a desktop.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/"
            className="rounded-sm bg-signal py-2.5 font-mono text-[11px] font-bold tracking-wide text-[#0A0A0A]"
          >
            BACK TO THE FEED
          </Link>
          <p className="font-mono text-[10px] text-[#4b5563]">
            Everything else — trading, launching, NFTs — works on mobile.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ClientTerminal({ initialSymbol }: { initialSymbol?: string }) {
  const isDesktop = useIsDesktop();
  // Not merely hidden with CSS: the terminal is heavy, and mounting it on a
  // phone would pay the chart/websocket cost for a surface nobody can use.
  if (!isDesktop) return <DesktopOnlyNotice />;
  return <Terminal {...(initialSymbol !== undefined ? { initialSymbol } : {})} />;
}
