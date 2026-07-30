"use client";

import { useState } from "react";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUSTOM_SKIN, customSkinRemaining, normalizeCustomUri, SKINS } from "@/lib/nft-skins";

/**
 * The Signature skin: your own artwork, in place of a generated card.
 *
 * Presented apart from the swatch row because it behaves differently — no
 * palette, an input rather than a click, and it can't be bought. It unlocks
 * only by owning every other skin, so the locked state deliberately shows the
 * progress rather than a price.
 */
export function SignatureField({
  owned,
  active,
  currentUri,
  busy,
  onApply,
}: {
  owned: string[];
  /** Whether Signature is the skin currently worn. */
  active: boolean;
  currentUri: string | null;
  busy: boolean;
  onApply: (uri: string) => void;
}) {
  const [uri, setUri] = useState(currentUri ?? "");
  const remaining = customSkinRemaining(owned);
  const unlocked = remaining === 0;
  const valid = normalizeCustomUri(uri) !== null;

  return (
    <div
      className={cn(
        "mt-2.5 rounded-sm border p-3 transition-colors",
        active
          ? "border-signal/50 bg-signal/[0.06]"
          : unlocked
            ? "border-white/12"
            : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <div className="flex items-center gap-2">
        {unlocked ? (
          <Sparkles className={cn("h-3.5 w-3.5 shrink-0", active ? "text-signal" : "text-[#9aa4af]")} />
        ) : (
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#4b5563]" />
        )}
        <span
          className={cn(
            "font-mono text-[11px] font-bold",
            unlocked ? (active ? "text-signal" : "text-[#F5F4F0]") : "text-[#6B6B6B]",
          )}
        >
          {CUSTOM_SKIN.name}
        </span>
        {active && <span className="font-mono text-[9px] text-signal">WEARING</span>}
        {!unlocked && (
          <span className="ml-auto font-mono text-[9px] text-[#4b5563]">
            {remaining} of {SKINS.length} to go
          </span>
        )}
      </div>

      {unlocked ? (
        <>
          <div className="mt-2 flex gap-1.5">
            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="https://…/art.png"
              className="min-w-0 flex-1 rounded-sm border border-white/10 bg-[#0A0A0A] px-2.5 py-1.5 font-mono text-[11px] outline-none placeholder:text-[#4b5563] focus:border-signal/50"
            />
            <button
              type="button"
              onClick={() => onApply(uri)}
              disabled={busy || !valid}
              className="shrink-0 rounded-sm bg-signal px-3 py-1.5 font-mono text-[10px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : active ? "UPDATE" : "APPLY"}
            </button>
          </div>
          {uri.trim() !== "" && !valid && (
            <p className="mt-1.5 font-mono text-[10px] text-noise">
              Needs an https URL, 200 characters or fewer.
            </p>
          )}
          <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[#4b5563]">
            Wallets and explorers load this directly, so it has to stay reachable — and it
            replaces the generated card everywhere, not just here.
          </p>
        </>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[#4b5563]">
          {CUSTOM_SKIN.blurb} Can&apos;t be bought — collect the rest and it&apos;s yours.
        </p>
      )}
    </div>
  );
}
