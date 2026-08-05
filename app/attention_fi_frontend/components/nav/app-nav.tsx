"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { TickerTape } from "@/components/feed/ticker-tape";
import { WaitlistButton } from "@/components/waitlist/waitlist-button";
import { WalletButton } from "@/components/wallet/wallet-button";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { refreshSolUsd } from "@/lib/solana/sol-usd";
import { syncRegistry } from "@/lib/solana/registry";
import { cn } from "@/lib/utils";
import { V0_GATE } from "@/lib/v0-gate";

const APP_LINKS = [
  { label: "Discover", href: "/discover" },
  { label: "Terminal", href: "/terminal" },
  { label: "Launch", href: "/launch" },
  { label: "NFT", href: "/nft" },
] as const;

/** On the gated deployment the app surfaces redirect, so point at the story
 *  instead — offering a link the proxy will bounce is worse than no link. */
const V0_LINKS = [
  { label: "Thesis", href: "/#thesis" },
  { label: "Mechanism Design", href: "/#mechanism" },
  { label: "Verticals", href: "/#verticals" },
] as const;

const LINKS: readonly { label: string; href: string }[] = V0_GATE ? V0_LINKS : APP_LINKS;

/** The link set, shared by the desktop centre row and the mobile scroll row. */
function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <li key={l.href} className="leading-none">
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-block whitespace-nowrap py-1 font-mono text-[11px] leading-none tracking-wide transition-colors",
                active ? "font-bold text-signal" : "text-[#6B6B6B] hover:text-[#F5F4F0]",
              )}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </>
  );
}

/**
 * Global navigation. Rendered from the root layout on every page except
 * /terminal, which ships its own dense top bar (with a brand link back here).
 */
export function AppNav() {
  const pathname = usePathname();

  // Keep the app-wide SOL/USD display rate fresh (used by feeds, token pages,
  // NFT pricing). Refreshes on load and every 5 min; the rate is display-only.
  useEffect(() => {
    void refreshSolUsd();
    // Tokens launched on another device or by another user live only in the
    // server registry; without this they can't be found or traded here.
    void syncRegistry();
    const id = setInterval(() => {
      void refreshSolUsd();
      void syncRegistry(true);
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (pathname.startsWith("/terminal")) return null;

  return (
    <>
      {/* the price ticker rides above the nav on home, at the very top */}
      {pathname === "/" && <TickerTape />}
      <nav className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0A]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 sm:px-5">
        {/* three-region bar: logo left, links centered, actions right. Below sm
            the links drop to their own row so the logo and wallet never squash. */}
        <div className="flex items-center py-3">
          <Link href="/" aria-label="AttentionFi home" className="shrink-0">
            <Logo />
          </Link>
          <ul className="hidden flex-1 items-center justify-center gap-3 px-2 sm:flex sm:gap-6">
            <NavLinks pathname={pathname} />
          </ul>
          <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:ml-0">
            {pathname === "/" && <WaitlistButton />}
            <NotificationsBell />
            <WalletButton />
          </div>
        </div>
        {/* mobile link row — scrolls horizontally rather than wrapping or
            compressing, so every destination stays one tap away */}
        <ul className="af-no-scrollbar -mx-4 flex items-center gap-5 overflow-x-auto px-4 pb-2.5 sm:hidden">
          <NavLinks pathname={pathname} />
        </ul>
      </div>
      </nav>
    </>
  );
}
