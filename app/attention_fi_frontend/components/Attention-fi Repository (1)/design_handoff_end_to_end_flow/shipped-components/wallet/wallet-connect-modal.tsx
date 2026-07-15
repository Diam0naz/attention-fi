"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WalletOption {
  id: string;
  name: string;
  detected?: boolean;
  icon?: React.ReactNode;
}

const DEFAULT_WALLETS: WalletOption[] = [
  { id: "phantom", name: "Phantom", detected: true },
  { id: "solflare", name: "Solflare" },
  { id: "backpack", name: "Backpack" },
  { id: "coinbase", name: "Coinbase Wallet" },
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
        className="w-full max-w-[420px] rounded-sm border border-white/10 bg-[#0f1620] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-white/[0.08] px-5 py-4">
          <span className="font-mono text-[13px] font-bold">Connect wallet</span>
          <button
            aria-label="Close"
            onClick={onClose}
            className="ml-auto text-[#6B6B6B] transition-colors hover:text-[#F5F4F0]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {wallets.map((w) => (
            <button
              key={w.id}
              onClick={() => onSelect(w.id)}
              className="flex items-center gap-3 rounded-sm border border-white/10 bg-[#12181f] px-3.5 py-3 text-left text-[13px] font-semibold text-[#F5F4F0] transition-colors hover:border-white/20"
            >
              <span className="h-6.5 w-6.5 shrink-0 rounded-sm bg-white/10" aria-hidden />
              {w.name}
              {w.detected && (
                <span className="ml-auto font-mono text-[9px] tracking-[0.08em] text-[#6B6B6B]">
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
