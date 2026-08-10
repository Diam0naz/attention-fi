import { cn } from "@/lib/utils";

/**
 * "Not investment advice", where someone will actually read it.
 *
 * The checklist is specific about placement: "above the fold, not buried in
 * ToS", and its reasoning is worth keeping in view — this doesn't immunise
 * anything, but the Howey analysis turns partly on whether users had a
 * reasonable expectation of profit, and an interface that never promises
 * returns is harder to characterise as having created one. A disclaimer nobody
 * sees does nothing for that; one sitting next to the buy button does.
 *
 * Two sizes because the argument is the same in both places and the space
 * isn't: `inline` sits on a token page beside the price, `full` closes the
 * footer on every page.
 */
export function RiskDisclaimer({
  variant = "inline",
  className,
}: {
  variant?: "inline" | "full";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <p
        className={cn(
          "rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 font-mono text-[10px] leading-relaxed text-[#6B6B6B]",
          className,
        )}
      >
        <span className="font-bold text-[#9a9a9a]">Not investment advice.</span> Attention
        tokens are speculative and can go to zero. Mindshare measures conversation, not
        revenue, quality or endorsement — a token existing for an account implies no
        connection to, or approval by, that account. Nothing here is an offer, a
        recommendation, or a promise of any return.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "border-t border-white/[0.06] pt-6 text-[11px] leading-relaxed text-[#6B6B6B]",
        className,
      )}
    >
      <span className="font-bold text-[#9a9a9a]">Not investment advice.</span> AttentionFi is
      software for trading speculative assets on a public blockchain. Attention tokens are
      volatile, frequently illiquid, and can lose all value. Mindshare is a measure of how much
      an account is being discussed — it is not a measure of revenue, quality, accuracy or
      endorsement, and a token existing for an account implies no relationship with, or
      approval by, that account.
      <br />
      <br />
      Nothing on this site is an offer to sell, a solicitation to buy, or a recommendation of
      any asset, and no return is promised or implied. You interact with the protocol directly
      from your own wallet; transactions are irreversible and are your responsibility. Consider
      taking independent advice, and never commit money you cannot afford to lose entirely.
    </div>
  );
}
