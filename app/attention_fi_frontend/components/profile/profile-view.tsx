"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Camera, Check, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { Footer } from "@/components/feed/footer";
import { NftCard, type NftCardData } from "@/components/nft/nft-card";
import { NftLanyard } from "@/components/nft/nft-lanyard";
import { useOwnedNfts } from "@/components/nft/use-owned-nfts";
import { useSolBalance } from "@/lib/solana/use-sol-balance";
import { useTokenBalance } from "@/lib/solana/use-token-balance";
import { USDC_MINT } from "@/lib/solana/config";
import { myCreatedTokens, type CreatedToken } from "@/lib/solana/registry";
import { useTokenIndex } from "@/lib/token-index";
import { fetchLaunchedMints } from "@/lib/solana/launched";
import { useReadonlyProgram } from "@/lib/solana/use-program";
import { useHoldings } from "@/lib/solana/use-holdings";
import { useNftPortfolio } from "@/components/nft/use-nft-portfolio";
import { RefreshButton } from "@/components/ui/refresh-button";
import { syncRegistry } from "@/lib/solana/registry";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function ProfileView() {
  const { connected, address, shortAddress } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pfp, setPfp] = useState<string | null>(null);
  const [selectedNft, setSelectedNft] = useState<NftCardData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const solBalance = useSolBalance();
  const usdcBalance = useTokenBalance(USDC_MINT);
  const ownedOnchain = useOwnedNfts();
  // Real balances priced off the live curves. The mock this replaced derived
  // holdings from the wallet address, so every wallet saw a stable, plausible
  // portfolio it did not own.
  const { holdings, totalUsd, claimableUsd, loaded: holdingsLoaded } = useHoldings();
  // Read from the Verification PDA. This line previously reported a mock
  // handle, i.e. told a wallet it was verified as someone it isn't.
  const nftPortfolio = useNftPortfolio();

  // Tokens actually launched from this browser, merged with live on-chain
  // market caps. The handle↔mint mapping only exists in the local registry
  // (a bare SPL mint carries no handle on-chain), so this is the source of
  // truth for "what did I create" — not the mock portfolio.
  const { tokens: indexed } = useTokenIndex();
  const readonlyProgram = useReadonlyProgram();
  const [launched, setLaunched] = useState<CreatedToken[]>([]);
  // Mints that exist under any launch mechanism, not just bonding curves.
  const [launchedMints, setLaunchedMints] = useState<Set<string>>(() => new Set());
  const [launchNonce, setLaunchNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = address ? await myCreatedTokens(address) : [];
      if (!cancelled) setLaunched(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, launchNonce]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mints = await fetchLaunchedMints(readonlyProgram).catch(() => new Set<string>());
      if (!cancelled) setLaunchedMints(mints);
    })();
    return () => {
      cancelled = true;
    };
  }, [readonlyProgram, launchNonce]);

  /** Re-read the profile's on-chain halves together. */
  async function refreshProfile() {
    nftPortfolio.refresh();
    setLaunchNonce((n) => n + 1);
    await syncRegistry(true);
  }
  const created = useMemo(() => {
    return launched.map((t) => {
      const entry = indexed.find((i) => i.handle === t.handle);
      return {
        handle: t.handle,
        name: t.name ?? t.handle,
        // Market cap only exists for a bonding curve; the other mechanisms
        // price differently and this panel doesn't try to.
        marketCap: entry?.marketCap ?? 0,
        // Liveness comes from the mint existing under *any* mechanism, not
        // from the bonding-curve index. A revenue, conviction or Dutch launch
        // has no BondingCurve account and used to read PENDING forever.
        live: launchedMints.has(t.mint),
      };
    });
  }, [launched, indexed, launchedMints]);

  // Opt-in profile picture, persisted per wallet address (client-only). Loaded on
  // address change via adjust-state-on-prop-change (no setState-in-effect).
  const [pfpFor, setPfpFor] = useState<string | null>(null);
  if (address !== pfpFor) {
    setPfpFor(address);
    setPfp(address ? window.localStorage.getItem(`af.pfp.${address}`) : null);
  }

  function copyAddress() {
    if (!address) return;
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !address) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPfp(url);
      window.localStorage.setItem(`af.pfp.${address}`, url);
    };
    reader.readAsDataURL(file);
  }

  // No longer gated on the NFT read: verification is one line of this page, and
  // a slow or failed credential lookup shouldn't hide the whole profile.
  if (!connected) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center px-5">
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8 text-center">
            <div className="text-[15px] font-bold">Connect a wallet to view your profile</div>
            <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-[#6B6B6B]">
              Your holdings, launched tokens, claimable creator fees, and NFTs live here.
            </p>
            <button
              onClick={() => setWalletOpen(true)}
              className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
            >
              Connect Wallet
            </button>
          </div>
        </div>
        <Footer />
        <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </div>
    );
  }

  // Real on-chain NFTs once connected — never masked with mock data.
  const nftCollection = ownedOnchain.data;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />

      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-7">
        {/* overview */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10"
            aria-label="Set profile picture"
          >
            {pfp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pfp} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(45deg,#1c2733,#1c2733_5px,#222f3d_5px,#222f3d_10px)] font-mono text-[15px] font-bold text-signal">
                {address?.slice(0, 2)}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-4 w-4 text-white" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[15px] font-bold">
              {shortAddress}
              <button
                onClick={copyAddress}
                className="text-[#4b5563] transition-colors hover:text-signal"
                aria-label="Copy address"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[#6B6B6B]">
              {nftPortfolio.status === "loading" ? (
                <span>Checking verification…</span>
              ) : nftPortfolio.data?.verification ? (
                <span className="inline-flex items-center gap-1 text-signal">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified @
                  {nftPortfolio.data.verification.handle}
                </span>
              ) : (
                <span>Handle not verified</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:ml-auto">
            <Stat label="PORTFOLIO" value={holdingsLoaded ? usd(totalUsd) : "…"} />
            <Stat
              label="CLAIMABLE FEES"
              value={holdingsLoaded ? usd(claimableUsd) : "…"}
              accent
            />
            <Stat label="SOL BALANCE" value={solBalance != null ? solBalance.toFixed(3) : "…"} />
            <Stat label="USDC" value={usdcBalance != null ? `$${usdcBalance.toFixed(2)}` : "…"} />
          </div>
        </div>

        {/* holdings */}
        <Section title="Holdings" count={holdings.length}>
          <div className="overflow-hidden rounded-sm border border-white/[0.06]">
            <div className="grid grid-cols-[1fr_auto_88px] gap-3 bg-white/[0.03] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              <span>Token</span>
              <span className="text-right">Exit cost</span>
              <span className="text-right">Value</span>
            </div>
            {!holdingsLoaded ? (
              <div className="border-t border-white/[0.05] px-4 py-6 text-center font-mono text-[11px] text-[#6B6B6B]">
                Reading balances…
              </div>
            ) : holdings.length === 0 ? (
              <div className="border-t border-white/[0.05] px-4 py-6 text-center">
                <p className="font-mono text-[11px] text-[#6B6B6B]">
                  No AttentionFi tokens in this wallet yet.
                </p>
                <Link
                  href="/discover"
                  className="mt-3 inline-block rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
                >
                  Find a token
                </Link>
              </div>
            ) : (
              holdings.map((h) => (
                <Link
                  key={h.mint}
                  href={`/token/${h.handle}`}
                  className="grid grid-cols-[1fr_auto_88px] items-center gap-3 border-t border-white/[0.05] px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-6 w-6 shrink-0 rounded-full bg-[repeating-linear-gradient(45deg,#1c2733,#1c2733_3px,#222f3d_3px,#222f3d_6px)]" />
                    <span className="truncate text-[13px] font-semibold">@{h.handle}</span>
                    <span className="font-mono text-[10px] text-[#6B6B6B]">
                      {h.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} $
                      {h.symbol}
                    </span>
                    {/* A value you can't currently realise is a different thing
                        from a value, and the row would otherwise look ordinary. */}
                    {h.stranded && (
                      <span
                        className="shrink-0 rounded-sm border border-signal/40 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-signal"
                        title="Graduated but not yet migrated — can't be sold until someone runs the migration. Anyone can."
                      >
                        Locked
                      </span>
                    )}
                    {h.graduated && (
                      <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.08em] text-[#6B6B6B]">
                        AMM
                      </span>
                    )}
                  </span>
                  {/* What the position costs to exit, not a price change. The
                      mock reported a 24h delta this app has no history for. */}
                  <span
                    className="text-right font-mono text-[12px] text-[#6B6B6B]"
                    title="How much less than spot this position fetches if sold in one go"
                  >
                    {h.stranded ? "—" : h.slippage >= 0.001 ? `-${(h.slippage * 100).toFixed(1)}%` : "—"}
                  </span>
                  <span className="text-right font-mono text-[13px]">{usd(h.valueUsd)}</span>
                </Link>
              ))
            )}
          </div>
        </Section>

        {/* created tokens — real launches from this browser's registry */}
        <Section title="Tokens you created" count={created.length}>
          {created.length === 0 ? (
            <div className="rounded-sm border border-dashed border-white/12 p-6 text-center">
              <p className="font-mono text-[11px] text-[#6B6B6B]">
                You haven&apos;t launched any tokens yet.
              </p>
              <Link
                href="/launch"
                className="mt-3 inline-block rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A]"
              >
                Launch a token
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {created.map((c) => (
                <Link
                  key={c.handle}
                  href={`/token/${c.handle}`}
                  className="group rounded-sm border border-white/[0.08] bg-[#0f1620] p-4 transition-colors hover:border-signal/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold group-hover:text-signal">@{c.handle}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[8px]",
                        c.live
                          ? "border-signal/40 text-signal"
                          : "border-white/15 text-[#6B6B6B]",
                      )}
                    >
                      {c.live ? "LIVE" : "PENDING"}
                    </span>
                    <span className="ml-auto font-mono text-[12px] text-[#6B6B6B]">
                      {c.live ? `MCAP ${usd(c.marketCap)}` : "—"}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
                    {c.name} · manage &amp; claim creator fees on the token page →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* NFTs — the actual issued assets */}
        <Section title="Your NFTs" action={<RefreshButton onRefresh={refreshProfile} />}>
          {ownedOnchain.status === "loading" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="aspect-3/4 animate-pulse rounded-sm bg-white/4" />
              ))}
            </div>
          ) : ownedOnchain.status === "error" ? (
            <p className="text-[12px] text-noise">
              Couldn&apos;t reach the chain to load your NFTs — check your connection and reload.
            </p>
          ) : nftCollection.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {nftCollection.map((d, i) => (
                <NftCard key={i} data={d} onClick={() => setSelectedNft(d)} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[#6B6B6B]">
              No NFTs yet — verify your handle or mint a perk to start your collection.
            </p>
          )}
          <Link
            href="/nft"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-signal hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" /> Manage NFTs & auctions →
          </Link>
        </Section>
      </div>

      <Footer />
      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      <NftLanyard data={selectedNft} onClose={() => setSelectedNft(null)} />
    </div>
  );
}

/**
 * Breadcrumb row only. The wallet address and Disconnect live in the global nav
 * directly above; carrying a second copy here meant two controls for one piece
 * of state, and on a phone the extra chip pushed the row wide enough to
 * overflow horizontally.
 */
function TopBar() {
  return (
    <nav className="flex items-center gap-4 border-b border-white/[0.08] px-5 py-3">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="font-mono text-[11px]">Feed</span>
      </Link>
      <span className="text-[#4b5563]">/</span>
      <span className="font-mono text-[12px]">Profile</span>
      <Link
        href="/discover"
        className="ml-auto font-mono text-[11px] text-[#6B6B6B] transition-colors hover:text-signal"
      >
        Discover
      </Link>
    </nav>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] px-4 py-2.5">
      <div className="font-mono text-[9px] text-[#6B6B6B]">{label}</div>
      <div className={cn("mt-0.5 font-mono text-[18px] font-bold", accent && "text-signal")}>{value}</div>
    </div>
  );
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  /** Optional control (e.g. refresh) pinned to the right of the heading. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[14px] font-bold">{title}</h2>
        {count !== undefined && <span className="font-mono text-[11px] text-[#6B6B6B]">{count}</span>}
        {action && <span className="ml-auto self-center">{action}</span>}
      </div>
      {children}
    </section>
  );
}
