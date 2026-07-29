"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { WALLETS, useWallet } from "@/components/wallet/wallet-provider";
import { WalletMark, hasMark } from "@/components/wallet/wallet-icons";
import { useScrollLock } from "@/lib/use-scroll-lock";

export function WalletConnectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { detected, icons, connect } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  useScrollLock(open);

  if (!open) return null;

  async function pick(id: string) {
    setBusy(id);
    const ok = await connect(id);
    setBusy(null);
    if (ok) onClose();
  }

  // Portal to <body>: ancestors with backdrop-filter/transform (e.g. the
  // blurred sticky nav) become containing blocks for position:fixed and
  // would clip the overlay to their own box.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#0d141c] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-white/[0.08] px-5 py-4">
          <span className="font-mono text-[13px] font-bold">Connect wallet</span>
          <button
            aria-label="Close"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-[#F5F4F0]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {WALLETS.map((w) => {
            const isDetected = detected.has(w.id);
            return (
              <button
                key={w.id}
                onClick={() => pick(w.id)}
                disabled={busy !== null}
                className="group flex items-center gap-3 rounded-md border border-white/[0.08] bg-[#12181f] px-3.5 py-3 text-left text-[13px] font-semibold text-[#F5F4F0] transition-all hover:border-signal/40 hover:bg-[#151d26] active:scale-[0.99] disabled:opacity-50"
              >
                {/* Prefer the logo the installed wallet publishes about
                    itself; fall back to our own mark, then to an initial. */}
                {icons[w.id] ? (
                  <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={icons[w.id]} alt="" className="h-full w-full object-cover" />
                  </span>
                ) : hasMark(w.id) ? (
                  <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
                    <WalletMark id={w.id} />
                  </span>
                ) : (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-bold shadow-inner"
                    style={{ background: w.brand, color: w.fg }}
                    aria-hidden
                  >
                    {w.name.charAt(0)}
                  </span>
                )}
                {w.name}
                <span className="ml-auto">
                  {busy === w.id ? (
                    <span className="font-mono text-[9px] tracking-[0.1em] text-[#6B6B6B]">CONNECTING…</span>
                  ) : isDetected ? (
                    <span className="rounded-full border border-signal/30 bg-signal/[0.08] px-2 py-0.5 font-mono text-[8px] font-bold tracking-[0.1em] text-signal">
                      DETECTED
                    </span>
                  ) : (
                    <span className="font-mono text-[8px] tracking-[0.1em] text-[#4b5563]">INSTALL</span>
                  )}
                </span>
              </button>
            );
          })}
          <p className="mt-1.5 text-center font-mono text-[10px] text-[#6B6B6B]">
            By connecting you accept the Terms of Use
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
