"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Minimal shape of an injected Solana wallet provider (Phantom/Solflare/etc). */
interface Injected {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } }>;
  disconnect?: () => Promise<void>;
}

export interface WalletMeta {
  id: string;
  name: string;
  brand: string;
  fg: string;
  /** Install / download page, used when the wallet isn't detected. */
  url: string;
}

export const WALLETS: WalletMeta[] = [
  { id: "phantom", name: "Phantom", brand: "linear-gradient(135deg,#ab9ff2,#4fd1c5)", fg: "#2a2250", url: "https://phantom.app/" },
  { id: "solflare", name: "Solflare", brand: "linear-gradient(135deg,#3b82f6,#1652f0)", fg: "#ffffff", url: "https://solflare.com/" },
  { id: "backpack", name: "Backpack", brand: "#0b0b0e", fg: "#e33e5c", url: "https://backpack.app/" },
  { id: "coinbase", name: "Coinbase Wallet", brand: "linear-gradient(135deg,#f5b300,#e08a00)", fg: "#1a1200", url: "https://www.coinbase.com/wallet" },
];

function getProvider(id: string): Injected | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    phantom?: { solana?: Injected };
    solana?: Injected;
    solflare?: Injected;
    backpack?: Injected;
    coinbaseSolana?: Injected;
  };
  switch (id) {
    case "phantom":
      return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined);
    case "solflare":
      return w.solflare;
    case "backpack":
      return w.backpack;
    case "coinbase":
      return w.coinbaseSolana;
    default:
      return undefined;
  }
}

const short = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;

interface WalletContextValue {
  connected: boolean;
  address: string | null;
  shortAddress: string | null;
  walletId: string | null;
  detected: Set<string>;
  connect: (id: string) => Promise<boolean>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "af.wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [detected, setDetected] = useState<Set<string>>(new Set());

  const refreshDetected = useCallback(() => {
    setDetected(new Set(WALLETS.filter((w) => getProvider(w.id)).map((w) => w.id)));
  }, []);

  // Detect installed wallets on mount and when the tab regains focus (wallets
  // inject asynchronously, so re-check after a short delay too).
  useEffect(() => {
    refreshDetected();
    const t = setTimeout(refreshDetected, 800);
    window.addEventListener("focus", refreshDetected);
    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", refreshDetected);
    };
  }, [refreshDetected]);

  // Eager reconnect if the user previously connected and the wallet trusts us.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) return;
    const provider = getProvider(saved);
    if (!provider) return;
    provider
      .connect({ onlyIfTrusted: true })
      .then((res) => {
        const pk = res?.publicKey?.toString() ?? provider.publicKey?.toString();
        if (pk) {
          setAddress(pk);
          setWalletId(saved);
        }
      })
      .catch(() => undefined);
  }, []);

  const connect = useCallback(async (id: string): Promise<boolean> => {
    const provider = getProvider(id);
    if (!provider) {
      const meta = WALLETS.find((w) => w.id === id);
      if (meta) window.open(meta.url, "_blank", "noopener,noreferrer");
      return false;
    }
    try {
      const res = await provider.connect();
      const pk = res?.publicKey?.toString() ?? provider.publicKey?.toString();
      if (!pk) return false;
      setAddress(pk);
      setWalletId(id);
      window.localStorage.setItem(STORAGE_KEY, id);
      return true;
    } catch {
      return false; // user rejected
    }
  }, []);

  const disconnect = useCallback(() => {
    if (walletId) getProvider(walletId)?.disconnect?.().catch(() => undefined);
    setAddress(null);
    setWalletId(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, [walletId]);

  const value = useMemo<WalletContextValue>(
    () => ({
      connected: address !== null,
      address,
      shortAddress: address ? short(address) : null,
      walletId,
      detected,
      connect,
      disconnect,
    }),
    [address, walletId, detected, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
