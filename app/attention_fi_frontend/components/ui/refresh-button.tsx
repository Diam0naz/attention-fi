"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Re-read a surface's data without reloading the page.
 *
 * Most panels here poll on a timer, but a timer is the wrong tool right after
 * you've signed something — you know the state changed and shouldn't wait out
 * an interval. `onRefresh` may be sync or async; the spin runs until it
 * settles, with a short floor so a fast refresh still reads as a response
 * rather than a flicker.
 */
export function RefreshButton({
  onRefresh,
  label = "Refresh",
  className,
}: {
  onRefresh: () => void | Promise<unknown>;
  label?: string;
  className?: string;
}) {
  const [spinning, setSpinning] = useState(false);

  async function run() {
    if (spinning) return;
    setSpinning(true);
    const started = Date.now();
    try {
      await onRefresh();
    } catch {
      // The surface being refreshed owns its own error reporting; a failed
      // re-read shouldn't blow up the button.
    } finally {
      const elapsed = Date.now() - started;
      setTimeout(() => setSpinning(false), Math.max(0, 400 - elapsed));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={spinning}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:border-white/25 hover:text-[#F5F4F0] disabled:opacity-60",
        className,
      )}
    >
      <RotateCw className={cn("h-3 w-3", spinning && "animate-spin")} />
      {spinning ? "…" : label}
    </button>
  );
}
