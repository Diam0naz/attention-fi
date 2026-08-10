"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/notice";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";
import {
  earningsOn,
  estimateDilution,
  fetchCommittedShareBps,
  type DilutionEstimate,
} from "@/lib/solana/genesis-dilution";

/** Reference volume for the money framing. Arbitrary, and labelled as such. */
const REFERENCE_VOLUME_USD = 100_000;

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(n < 10 ? 2 : 0)}`;

/**
 * What issuing these NFTs costs the creator, in their own fee stream.
 *
 * The forms already multiplied units by share, but that number answers the
 * wrong question twice over. A genesis NFT takes a slice of the *creator's*
 * cut, not of volume — so "1% per unit" is 1% of roughly half a percent, and a
 * creator reading it as 1% of trading is out by a factor of two hundred. And
 * the multiplication ignored what the token had already sold, so a creator who
 * had committed 60% of their stream was shown "5%" for an issuance that would
 * actually put them at 65%.
 *
 * Both numbers come from the chain: `Global` for the fee split, because both
 * halves are tunable without a redeploy, and `GenesisPool` for what is already
 * committed. A preview that assumed either would start lying the first time one
 * changed.
 */
export function DilutionPreview({
  subjectMint,
  units,
  shareBpsPerUnit,
  className,
}: {
  /** The token whose fee stream is being divided; null before one is picked. */
  subjectMint: string | null;
  units: number;
  shareBpsPerUnit: number;
  className?: string;
}) {
  const readProgram = useReadonlyProgram();
  const [committedBps, setCommittedBps] = useState(0);
  const [fees, setFees] = useState<{ feeBps: number; creatorFeeShareBps: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const g = await fetchGlobal(readProgram).catch(() => null);
      if (!cancelled && g) {
        setFees({ feeBps: g.feeBps, creatorFeeShareBps: g.creatorFeeShareBps });
      }
      const committed = subjectMint
        ? await fetchCommittedShareBps(readProgram, new PublicKey(subjectMint)).catch(() => 0)
        : 0;
      if (!cancelled) setCommittedBps(committed);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, subjectMint]);

  if (!fees || units <= 0 || shareBpsPerUnit <= 0) return null;

  const e: DilutionEstimate = estimateDilution({
    units,
    shareBpsPerUnit,
    committedBps,
    feeBps: fees.feeBps,
    creatorFeeShareBps: fees.creatorFeeShareBps,
  });
  const money = earningsOn(REFERENCE_VOLUME_USD, e);

  return (
    <div
      className={cn(
        "rounded-sm border p-3.5",
        e.oversubscribed ? "border-noise/40 bg-noise/[0.05]" : "border-signal/25 bg-signal/[0.04]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <PieChart className={cn("h-3.5 w-3.5", e.oversubscribed ? "text-noise" : "text-signal")} />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          What you&apos;re giving away
        </span>
      </div>

      {/* The bar is the whole point: one length is the creator's stream, and
          the parts of it are already-sold, being-sold-now, and kept. */}
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full bg-[#6B6B6B]"
          style={{ width: `${Math.min(100, (e.committedBps / 100) * 1)}%` }}
          title={`Already sold: ${pct(e.committedBps)}`}
        />
        <div
          className={cn("h-full", e.oversubscribed ? "bg-noise" : "bg-signal")}
          style={{ width: `${Math.min(100 - e.committedBps / 100, (e.addedBps / 100) * 1)}%` }}
          title={`This issuance: ${pct(e.addedBps)}`}
        />
      </div>

      <dl className="mt-3 flex flex-col gap-1.5 font-mono text-[11px]">
        {e.committedBps > 0 && (
          <div className="flex justify-between">
            <dt className="text-[#6B6B6B]">Already sold</dt>
            <dd className="text-[#9a9a9a]">{pct(e.committedBps)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-[#6B6B6B]">
            This issuance · {units} × {pct(shareBpsPerUnit)}
          </dt>
          <dd className={e.oversubscribed ? "text-noise" : "text-signal"}>{pct(e.addedBps)}</dd>
        </div>
        <div className="flex justify-between border-t border-white/[0.06] pt-1.5">
          <dt className="text-[#6B6B6B]">You keep</dt>
          <dd className="font-bold text-[#F5F4F0]">{pct(10_000 - Math.min(e.totalBps, 10_000))}</dd>
        </div>
      </dl>

      {/* The same fact in money, because a percentage of a percentage is hard
          to hold in your head at the moment of signing. */}
      <div className="mt-3 rounded-sm border border-white/[0.06] bg-[#0A0A0A] px-3 py-2 text-[11px] leading-relaxed text-[#9a9a9a]">
        On {usd(REFERENCE_VOLUME_USD)} of trading you&apos;d earn{" "}
        <span className="font-mono font-bold text-[#F5F4F0]">{usd(money.after)}</span> instead of{" "}
        <span className="font-mono text-[#6B6B6B]">{usd(money.before)}</span> —{" "}
        <span className="font-mono text-noise">{usd(money.givenAway)}</span> goes to holders.
        <span className="mt-1 block font-mono text-[10px] text-[#4b5563]">
          {usd(REFERENCE_VOLUME_USD)} is a reference figure, not a forecast. Your cut is{" "}
          {(e.creatorCutOfVolume * 100).toFixed(3)}% of volume today — a genesis NFT&apos;s share
          is a slice of that, not of the trade.
        </span>
      </div>

      {e.oversubscribed ? (
        <Notice tone="danger" title="THIS SELLS MORE THAN YOU HAVE" className="mt-3">
          {pct(e.totalBps)} is more than your whole stream. The program accepts this — it clamps
          the payout at your cut — so nothing breaks and nobody is overpaid. What happens instead
          is quieter and worse: every holder receives about {pct(e.effectiveShareBpsPerUnit)}{" "}
          rather than the {pct(shareBpsPerUnit)} printed on their NFT, and they find out when
          they claim. Reduce the count or the share.
        </Notice>
      ) : (
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#4b5563]">
          This is permanent. Genesis NFTs are transferable and carry their share forever — there
          is no expiry and no buy-back, so the stream you keep is the stream you keep.
        </p>
      )}
    </div>
  );
}
