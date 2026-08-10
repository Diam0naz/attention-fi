"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { OctagonAlert } from "lucide-react";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { REASON_COPY, fetchDisavowal, type Disavowal } from "@/lib/solana/disavowal";

/**
 * Says a token has been disowned, before anyone tries to buy it.
 *
 * The program refuses the buy either way, but a raw `TokenDisavowed` at the
 * moment of signing is the worst place to learn this — the reader has already
 * decided, typed an amount and reached for their wallet. The flag is a
 * statement about the token, so it belongs beside the token.
 *
 * Deliberately says what still works. A disowned token can be sold and its fees
 * claimed; only buying stops. Someone holding it needs to know they are not
 * trapped, and a bare "this token is flagged" reads like they are.
 */
export function DisavowBanner({ mint }: { mint: string | null }) {
  const readProgram = useReadonlyProgram();
  const [flag, setFlag] = useState<Disavowal | null>(null);

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;
    void (async () => {
      const d = await fetchDisavowal(readProgram, new PublicKey(mint)).catch(() => null);
      if (!cancelled) setFlag(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, mint]);

  if (!flag) return null;
  const copy = REASON_COPY[flag.reason];

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-sm border border-noise/50 bg-noise/[0.08] px-3.5 py-3"
    >
      <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-noise" />
      <div className="min-w-0">
        <div className="font-mono text-[11px] font-bold tracking-[0.06em] text-noise">
          {copy.label.toUpperCase()}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#c9c9c9]">{copy.blurb}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-[#9a9a9a]">
          <span className="font-bold">Buying is closed. Selling is not.</span> If you hold this
          token you can still sell it, and any fees you have accrued are still claimable — the
          flag stops new money going in, it doesn&apos;t lock you inside.
        </p>
      </div>
    </div>
  );
}
