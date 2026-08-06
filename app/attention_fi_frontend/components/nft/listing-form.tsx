"use client";

import { Clock, Infinity as InfinityIcon, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/notice";

/**
 * How a listing is priced over time.
 *
 * These are the three shapes the program accepts (`auction::validate_listing`).
 * The fourth combination — declining with no deadline — is rejected on-chain,
 * because a descent is defined by where it ends and when.
 */
export type ListingMode = "perpetual" | "timed" | "declining";

/** The triple every listing instruction takes. */
export interface ListingTerms {
  startPrice: number;
  floorPrice: number;
  /** Seconds. Zero means perpetual. */
  duration: number;
}

const MODES: {
  id: ListingMode;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "perpetual",
    label: "Fixed price",
    hint: "One price, no deadline. Sits until it sells or you take it down.",
    icon: <InfinityIcon className="h-3.5 w-3.5" />,
  },
  {
    id: "timed",
    label: "Fixed, timed",
    hint: "One price, but the listing expires.",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  {
    id: "declining",
    label: "Declining",
    hint: "Starts high and falls to a floor. For competitive launches.",
    icon: <TrendingDown className="h-3.5 w-3.5" />,
  },
];

/** Compute the on-chain terms for a mode, or null when the inputs don't hold. */
export function listingTerms(
  mode: ListingMode,
  price: string,
  floor: string,
  hours: string,
): ListingTerms | null {
  const priceNum = Number(price);
  const floorNum = Number(floor);
  const hoursNum = Number(hours);
  if (!Number.isFinite(priceNum) || priceNum <= 0) return null;

  if (mode === "perpetual") {
    // start == floor and duration 0 — the program requires both together.
    return { startPrice: priceNum, floorPrice: priceNum, duration: 0 };
  }
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) return null;
  const duration = Math.round(hoursNum * 3600);

  if (mode === "timed") {
    return { startPrice: priceNum, floorPrice: priceNum, duration };
  }
  if (!Number.isFinite(floorNum) || floorNum <= 0 || floorNum > priceNum) return null;
  return { startPrice: priceNum, floorPrice: floorNum, duration };
}

/**
 * Price and schedule inputs for a listing, shared by assets and collections.
 *
 * Defaults to a fixed perpetual price. The declining auction is a deliberate
 * opt-in rather than the only option: it removes the front-running edge when
 * many buyers compete before a deadline, which is what it was built for, but
 * for a single piece it publishes a schedule of concessions and a patient buyer
 * simply waits for the floor.
 */
export function ListingFields({
  mode,
  onModeChange,
  price,
  onPriceChange,
  floor,
  onFloorChange,
  hours,
  onHoursChange,
  subject,
}: {
  mode: ListingMode;
  onModeChange: (m: ListingMode) => void;
  price: string;
  onPriceChange: (v: string) => void;
  floor: string;
  onFloorChange: (v: string) => void;
  hours: string;
  onHoursChange: (v: string) => void;
  /** What's being sold, for the copy — "piece" or "collection". */
  subject: string;
}) {
  const active = MODES.find((m) => m.id === mode) ?? MODES[0]!;

  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
          Pricing
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onModeChange(m.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-sm border px-2 py-2.5 font-mono text-[10px] font-bold transition-colors",
                mode === m.id
                  ? "border-signal/50 bg-signal/[0.08] text-signal"
                  : "border-white/[0.1] text-[#6B6B6B] hover:border-white/25 hover:text-[#F5F4F0]",
              )}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#6B6B6B]">{active.hint}</p>
      </div>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
          {mode === "declining" ? "Starting price (SOL)" : "Price (SOL)"}
        </span>
        <input
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          inputMode="decimal"
          className="mt-1 w-full rounded-sm border border-white/[0.1] bg-[#0A0A0A] px-3 py-2 font-mono text-[13px] outline-none focus:border-signal/50"
        />
      </label>

      {mode === "declining" && (
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
            Floor price (SOL)
          </span>
          <input
            value={floor}
            onChange={(e) => onFloorChange(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-sm border border-white/[0.1] bg-[#0A0A0A] px-3 py-2 font-mono text-[13px] outline-none focus:border-signal/50"
          />
        </label>
      )}

      {mode !== "perpetual" && (
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
            Duration (hours)
          </span>
          <input
            value={hours}
            onChange={(e) => onHoursChange(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-sm border border-white/[0.1] bg-[#0A0A0A] px-3 py-2 font-mono text-[13px] outline-none focus:border-signal/50"
          />
        </label>
      )}

      {mode === "declining" && (
        <Notice tone="caution" title="A declining price is a public schedule">
          Everyone can see the floor and when it gets there, so a buyer who
          isn&apos;t in a hurry waits for it — treat the floor as the price you
          expect, not the worst case. It earns its keep when several buyers are
          competing before a deadline, because the first to move pays most and
          there&apos;s no advantage in being fast. For a single {subject} that
          competition usually isn&apos;t there.
        </Notice>
      )}

      {mode === "timed" && (
        <Notice tone="caution" title="The price holds, but the listing doesn't">
          The price never moves — only the window closes. When it does, the{" "}
          {subject} stops being buyable and stays in escrow until you reclaim
          it, which you can do at any time. Worth choosing when the deadline is
          the point: a drop that ends, or an offer you don&apos;t want standing
          indefinitely. If you just want it sold, the fixed price has no
          deadline to miss.
        </Notice>
      )}

      {mode === "perpetual" && (
        <Notice tone="info" title="Free to list, free to keep listed">
          There&apos;s no listing fee and no expiry — you&apos;re charged only
          when it sells. Take it down whenever you like.
        </Notice>
      )}
    </div>
  );
}
