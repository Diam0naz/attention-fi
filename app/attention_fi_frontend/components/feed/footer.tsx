"use client";

import { X_HANDLE, X_URL } from "@/lib/config";
import { Logo } from "@/components/brand/logo";
import { useAppAccess } from "@/components/wallet/use-app-access";
import { RiskDisclaimer } from "@/components/ui/risk-disclaimer";

const APP_PRODUCT = [
  { label: "Discover", href: "/discover" },
  { label: "Terminal", href: "/terminal" },
  { label: "Launch", href: "/launch" },
  { label: "NFT", href: "/nft" },
  { label: "Profile", href: "/profile" },
];

/** Before a wallet is connected — and on the gated deployment — the product
 *  column points at the story instead of surfaces that would turn you away. */
const V0_PRODUCT = [
  { label: "Thesis", href: "/#thesis" },
  { label: "Mechanism Design", href: "/#mechanism" },
  { label: "Verticals", href: "/#verticals" },
];

export function Footer() {
  const { unlocked } = useAppAccess();
  const product = unlocked ? APP_PRODUCT : V0_PRODUCT;
  return (
    <footer className="mt-16 border-t border-white/[0.08]">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo size={20} />
            <p className="mt-2 text-[12px] leading-relaxed text-[#6B6B6B]">
              Pump.fun for X — mindshare is the asset. Trade the attention of the X
              social graph on bonding curves seeded by real data.
            </p>
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex font-mono text-[11px] text-[#9aa4af] transition-colors hover:text-signal"
            >
              Follow @{X_HANDLE} on X →
            </a>
          </div>

          <div className="flex gap-12 font-mono text-[11px]">
            <div className="flex flex-col gap-2 text-[#6B6B6B]">
              <span className="text-[9px] uppercase tracking-[0.1em] text-[#4b5563]">Product</span>
              {product.map((l) => (
                <a key={l.href} href={l.href} className="transition-colors hover:text-[#F5F4F0]">
                  {l.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2 text-[#6B6B6B]">
              <span className="text-[9px] uppercase tracking-[0.1em] text-[#4b5563]">Community</span>
              <a href={X_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#F5F4F0]">
                X / Twitter
              </a>
              <span className="cursor-pointer transition-colors hover:text-[#F5F4F0]">Waitlist</span>
            </div>
          </div>
        </div>

        {/* The long form. The one-liner below used to be the only disclosure
            anywhere, which put it in the same class as a copyright notice —
            true, present, and read by nobody. */}
        <RiskDisclaimer variant="full" className="mt-8" />

        <div className="mt-6 flex flex-col gap-2 border-t border-white/[0.06] pt-5 font-mono text-[10px] text-[#4b5563] sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 AttentionFi · Phase 1 preview</span>
          <span>Experimental software · not audited</span>
        </div>
      </div>
    </footer>
  );
}
