"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { TickerTape } from "@/components/feed/ticker-tape";
import { WaitlistButton } from "@/components/waitlist/waitlist-button";
import { WalletButton } from "@/components/wallet/wallet-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Discover", href: "/discover" },
  { label: "Terminal", href: "/terminal" },
  { label: "Launch", href: "/launch" },
  { label: "NFT", href: "/nft" },
] as const;

/**
 * Global navigation. Rendered from the root layout on every page except
 * /terminal, which ships its own dense top bar (with a brand link back here).
 */
export function AppNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/terminal")) return null;

  return (
    <>
      {/* the price ticker rides above the nav on home, at the very top */}
      {pathname === "/" && <TickerTape />}
      <nav className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0A]/95 backdrop-blur-sm">
      {/* three-region bar: logo left, links centered, actions right */}
      <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-5">
        <Link href="/" aria-label="AttentionFi home" className="shrink-0">
          <Logo />
        </Link>
        <ul className="flex flex-1 items-center justify-center gap-3 px-2 sm:gap-6">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <li key={l.href} className="leading-none">
                <Link
                  href={l.href}
                  className={cn(
                    "inline-block py-1 font-mono text-[11px] leading-none tracking-wide transition-colors",
                    active ? "font-bold text-signal" : "text-[#6B6B6B] hover:text-[#F5F4F0]",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex shrink-0 items-center gap-2.5">
          {pathname === "/" && <WaitlistButton />}
          <WalletButton />
        </div>
      </div>
      </nav>
    </>
  );
}
