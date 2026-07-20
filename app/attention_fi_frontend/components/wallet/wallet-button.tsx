"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User, LogOut, ChevronDown } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";

/** Global nav control: connect when signed out; address + Profile/Disconnect menu when in. */
export function WalletButton() {
  const { connected, shortAddress, disconnect } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!connected) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="whitespace-nowrap rounded-sm border border-signal/50 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-signal transition-colors hover:bg-signal/10"
        >
          Connect<span className="hidden sm:inline"> Wallet</span>
        </button>
        <WalletConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/[0.06] px-2.5 py-1.5 font-mono text-[11px] font-bold text-signal"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal af-pulse-dot" />
        {shortAddress}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-sm border border-white/10 bg-[#0d141c] shadow-2xl">
          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-[#F5F4F0] transition-colors hover:bg-white/[0.06]"
          >
            <User className="h-3.5 w-3.5 text-[#6B6B6B]" /> Profile
          </Link>
          <button
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-2.5 text-left text-[12px] text-[#6B6B6B] transition-colors hover:bg-white/[0.06] hover:text-noise"
          >
            <LogOut className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
