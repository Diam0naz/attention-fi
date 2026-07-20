"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MOCK_TOKENS, type Vertical } from "@/lib/mock-data";
import { Footer } from "@/components/feed/footer";
import {
  VerticalSeeAll,
  DEFAULT_TOKENS,
  type VerticalTokenSummary,
} from "@/components/feed/vertical-see-all";

const PAGE = 8;

export function VerticalDiscover({ vertical }: { vertical: Vertical }) {
  const router = useRouter();
  const [visible, setVisible] = useState(PAGE);

  const all = useMemo<VerticalTokenSummary[]>(
    () =>
      MOCK_TOKENS.filter((t) => t.vertical === vertical).map((t) => ({
        handle: `@${t.handle}`,
        label: t.name,
        mindshare: `${t.mindshare.toFixed(2)}%`,
        delta: `${t.delta24h >= 0 ? "+" : ""}${t.delta24h.toFixed(0)}%`,
        verified: t.verified,
        positive: t.delta24h >= 0,
        marketCap: t.marketCap,
        tier: t.tier,
      })),
    [vertical],
  );

  // Fall back to the component's DEFAULT_TOKENS when this vertical has no data.
  const usingFallback = all.length === 0;
  const shown = usingFallback ? undefined : all.slice(0, visible);
  const totalCount = usingFallback ? DEFAULT_TOKENS.length : all.length;
  const remaining = usingFallback ? 0 : Math.max(0, all.length - visible);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1">
        <div className="px-5 pt-4">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#6B6B6B] transition-colors hover:text-[#F5F4F0]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All verticals
          </Link>
        </div>
        <VerticalSeeAll
          vertical={vertical}
          totalCount={totalCount}
          tokens={shown}
          remainingCount={remaining}
          onLoadMore={() => setVisible((v) => v + PAGE)}
          onSelectToken={(handle) => router.push(`/token/${handle.replace(/^@/, "")}`)}
        />
      </div>

      <Footer />
    </div>
  );
}
