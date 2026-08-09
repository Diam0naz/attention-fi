"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useAppAccess } from "@/components/wallet/use-app-access";
import { isGatedPath } from "@/lib/v0-gate";

/**
 * Stands in front of the app's surfaces until a wallet is connected.
 *
 * Deliberately renders in place rather than redirecting home. A redirect throws
 * away where the visitor was trying to go, so connecting drops them on the
 * landing page having forgotten why they came; this way the page they asked for
 * is what appears the moment they connect. It also cannot loop, which a
 * redirect keyed on asynchronously-restored state very much can.
 *
 * Deep links keep working for people who are already connected — the gate only
 * ever sees a decided answer, because it waits for `pending` to clear.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { unlocked, pending } = useAppAccess();
  const [modalOpen, setModalOpen] = useState(false);

  if (!isGatedPath(pathname) || unlocked) return <>{children}</>;

  // Nothing is claimed while the session is still being restored: a returning
  // user must never be shown "connect your wallet" over a page they already
  // have access to, however briefly.
  if (pending) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-5">
        <p className="font-mono text-[11px] tracking-wide text-[#4b5563]">Restoring session…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-5">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-sm border border-signal/40 bg-signal/[0.06]">
          <Wallet className="h-5 w-5 text-signal" />
        </div>
        <h1 className="mt-4 font-mono text-[13px] font-bold tracking-wide text-[#F5F4F0]">
          Connect a wallet to continue
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-[#6B6B6B]">
          Trading, launching and your profile live behind a wallet. The feed stays open —
          watch the market from the{" "}
          <Link href="/" className="text-signal transition-colors hover:underline">
            home page
          </Link>{" "}
          without connecting.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="mt-5 w-full rounded-sm border border-signal/50 px-3 py-2 font-mono text-[11px] font-bold tracking-wide text-signal transition-colors hover:bg-signal/10"
        >
          Connect Wallet
        </button>
      </div>
      <WalletConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  );
}
