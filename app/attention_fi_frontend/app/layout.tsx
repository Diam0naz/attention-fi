import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppNav } from "@/components/nav/app-nav";
import { WalletProvider } from "@/components/wallet/wallet-provider";

// Fonts are declared as a zero-network CSS stack in globals.css (`--font-sans` /
// `--font-geist-mono`) — no build-time fetch, so dev never hangs offline. Uses
// Space Grotesk / Space Mono if the machine has them, else a clean fallback.
// To pin the exact brand fonts, self-host the woff2 files via next/font/local.

export const metadata: Metadata = {
  title: "AttentionFi — Pump.fun for X",
  description:
    "Mindshare is the asset. Trade the attention of the social graph on bonding curves seeded by a live mindshare oracle.",
  // Belt-and-braces with app/robots.ts: a pre-launch deployment has to be
  // publicly reachable for the oracle, but shouldn't be indexed or previewed.
  robots:
    process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn("dark h-full antialiased font-sans")}
      suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#0A0A0A] text-[#F5F4F0]">
        <WalletProvider>
          <AppNav />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
