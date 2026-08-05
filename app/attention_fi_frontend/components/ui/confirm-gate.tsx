"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/notice";

/**
 * A checkbox that stands between the user and something permanent.
 *
 * Only worth attaching to actions with no later remedy — handing over protocol
 * authority, migrating reserves into a pool, writing a metadata URI that can
 * never be changed. Everything cheaper should use a plain {@link Notice}: a
 * gate on a reversible action is friction that trains people to tick boxes
 * without reading them, which is exactly the habit that makes the gate useless
 * where it counts.
 *
 * The consequence is spelled out in the label rather than kept generic, so the
 * tick is an acknowledgement of a specific fact rather than of having seen a
 * warning.
 */
export function ConfirmGate({
  title,
  consequence,
  acknowledgement,
  checked,
  onChange,
  className,
}: {
  title: string;
  /** What happens, in plain terms. Shown whether or not the box is ticked. */
  consequence: React.ReactNode;
  /** The specific claim the user is agreeing to. */
  acknowledgement: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Notice tone="danger" title={title}>
        {consequence}
      </Notice>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className="flex w-full items-start gap-2 rounded-sm border border-white/10 px-3 py-2 text-left transition-colors hover:border-white/25"
      >
        <span
          aria-hidden
          className={cn(
            "mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
            checked ? "border-noise bg-noise" : "border-white/25",
          )}
        >
          {checked && <Check className="h-2.5 w-2.5 text-[#0A0A0A]" />}
        </span>
        <span className="text-[11.5px] leading-relaxed text-[#9a9a9a]">{acknowledgement}</span>
      </button>
    </div>
  );
}

/**
 * Track a single gate's state.
 *
 * Returned rather than held inside {@link ConfirmGate} because the submit
 * button needs to read it, and a gate that can't disable anything is theatre.
 */
export function useConfirmGate(): {
  acknowledged: boolean;
  setAcknowledged: (next: boolean) => void;
  reset: () => void;
} {
  const [acknowledged, setAcknowledged] = useState(false);
  return {
    acknowledged,
    setAcknowledged,
    reset: () => setAcknowledged(false),
  };
}
