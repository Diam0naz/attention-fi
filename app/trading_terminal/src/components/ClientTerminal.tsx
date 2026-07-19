"use client";

import dynamic from "next/dynamic";

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

export function ClientTerminal() {
  return <Terminal />;
}
