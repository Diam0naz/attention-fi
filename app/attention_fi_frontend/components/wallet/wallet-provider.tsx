"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Minimal shape of an injected Solana wallet provider (Phantom/Solflare/etc). */
interface Injected {
  /** Data-URI logo the wallet advertises about itself (Wallet Standard). */
  icon?: string;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: <T>(tx: T) => Promise<T>;
  signAllTransactions?: <T>(txs: T[]) => Promise<T[]>;
  signMessage?: (msg: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
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
  { id: "solflare", name: "Solflare", brand: "linear-gradient(135deg,#ffc10b,#fc7227)", fg: "#2b1400", url: "https://solflare.com/" },
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
  /** Wallet id -> the logo that wallet advertises, for wallets present now. */
  icons: Record<string, string>;
  connect: (id: string) => Promise<boolean>;
  disconnect: () => void;
  /** The live injected provider — used to sign real transactions. */
  getSigner: () => Injected | undefined;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "af.wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [detected, setDetected] = useState<Set<string>>(new Set());
  // Injected wallets publish their own logo, so a detected wallet is drawn with
  // its real mark rather than an approximation that drifts when they rebrand.
  const [icons, setIcons] = useState<Record<string, string>>({});

  const refreshDetected = useCallback(() => {
    const present = WALLETS.map((w) => [w, getProvider(w.id)] as const).filter(([, p]) => p);
    setDetected(new Set(present.map(([w]) => w.id)));
    setIcons((prev) => {
      const next = { ...prev };
      for (const [w, provider] of present) {
        // Only data URIs: a remote src here would let an injected script
        // beacon every wallet-modal open to a third party.
        if (provider?.icon?.startsWith("data:image/")) next[w.id] = provider.icon;
      }
      return next;
    });
  }, []);

  // Detect installed wallets on mount and when the tab regains focus (wallets
  // inject asynchronously, so re-check after a short delay too).
  useEffect(() => {
    // Probe from timer callbacks rather than synchronously in the effect body.
    const first = setTimeout(refreshDetected, 0);
    const retry = setTimeout(refreshDetected, 800);
    window.addEventListener("focus", refreshDetected);
    return () => {
      clearTimeout(first);
      clearTimeout(retry);
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

  const getSigner = useCallback(() => (walletId ? getProvider(walletId) : undefined), [walletId]);

  const value = useMemo<WalletContextValue>(
    () => ({
      connected: address !== null,
      address,
      shortAddress: address ? short(address) : null,
      walletId,
      detected,
      icons,
      connect,
      disconnect,
      getSigner,
    }),
    [address, walletId, detected, icons, connect, disconnect, getSigner],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
