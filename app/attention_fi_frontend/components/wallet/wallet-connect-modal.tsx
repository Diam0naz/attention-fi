"use client";

import { X } from "lucide-react";

export interface WalletOption {
  id: string;
  name: string;
  detected?: boolean;
  /** CSS background (brand color or gradient) for the icon chip. */
  brand: string;
  /** Foreground color for the icon initial. */
  fg: string;
}

const DEFAULT_WALLETS: WalletOption[] = [
  { id: "phantom", name: "Phantom", detected: true, brand: "linear-gradient(135deg,#ab9ff2,#4fd1c5)", fg: "#2a2250" },
  { id: "solflare", name: "Solflare", brand: "linear-gradient(135deg,#3b82f6,#1652f0)", fg: "#ffffff" },
  { id: "backpack", name: "Backpack", brand: "#0b0b0e", fg: "#e33e5c" },
  { id: "coinbase", name: "Coinbase Wallet", brand: "linear-gradient(135deg,#f5b300,#e08a00)", fg: "#1a1200" },
];

export function WalletConnectModal({
  open,
  onClose,
  onSelect,
  wallets = DEFAULT_WALLETS,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (walletId: string) => void;
  wallets?: WalletOption[];
}) {
  if (!open) return null;

  return (
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
          {wallets.map((w) => (
            <button
              key={w.id}
              onClick={() => onSelect(w.id)}
              className="group flex items-center gap-3 rounded-md border border-white/[0.08] bg-[#12181f] px-3.5 py-3 text-left text-[13px] font-semibold text-[#F5F4F0] transition-all hover:border-signal/40 hover:bg-[#151d26] active:scale-[0.99]"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-bold shadow-inner"
                style={{ background: w.brand, color: w.fg }}
                aria-hidden
              >
                {w.name.charAt(0)}
              </span>
              {w.name}
              {w.detected && (
                <span className="ml-auto rounded-full border border-signal/30 bg-signal/[0.08] px-2 py-0.5 font-mono text-[8px] font-bold tracking-[0.1em] text-signal">
                  DETECTED
                </span>
              )}
            </button>
          ))}
          <p className="mt-1.5 text-center font-mono text-[10px] text-[#6B6B6B]">
            By connecting you accept the Terms of Use
          </p>
        </div>
      </div>
    </div>
  );
}
