"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Gift, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { PageBackground } from "@/components/reactbits/page-background";
import { NftCardFace, type NftCardData } from "@/components/nft/nft-card";
import { getNftState, getPortfolio } from "@/lib/mock-data";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { useProgram } from "@/lib/solana/use-program";
import { useIsAdmin } from "@/lib/solana/use-admin";
import { handleToMint } from "@/lib/solana/registry";
import { explorerTx } from "@/lib/solana/config";

const SOL_USD = 164.2;
const DURATION_SEC: Record<string, number> = { "6h": 21_600, "12h": 43_200, "24h": 86_400, "48h": 172_800 };

type Kind = "genesis" | "auction";

const KINDS: {
  id: Kind;
  name: string;
  tag: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "genesis",
    name: "Genesis (fee-share)",
    tag: "TRANSFERABLE",
    desc: "Issue NFTs that earn a pro-rata cut of your token's fee stream, forever. Holders claim as fees accrue.",
    icon: <Gift className="h-4 w-4" />,
  },
  {
    id: "auction",
    name: "1-of-1 auction",
    tag: "DUTCH",
    desc: "List a rare asset you own via descending Dutch auction — the price falls until someone buys. No front-running.",
    icon: <Gavel className="h-4 w-4" />,
  },
];

const STEPS = ["Type", "Configure", "Review", "Confirm"];
const DURATIONS = ["6h", "12h", "24h", "48h"];

export function NftCreateFlow() {
  const { connected, address, shortAddress } = useWallet();
  const program = useProgram();
  const isAdmin = useIsAdmin();
  const [walletOpen, setWalletOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("genesis");
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  // genesis config
  const [tokenHandle, setTokenHandle] = useState("");
  const [sharePct, setSharePct] = useState("1.0");
  const [supply, setSupply] = useState("100");
  // auction config
  const [assetId, setAssetId] = useState("");
  const [startUsd, setStartUsd] = useState("10000");
  const [floorUsd, setFloorUsd] = useState("2500");
  const [duration, setDuration] = useState("24h");

  const portfolio = useMemo(
    () => (address ? getPortfolio(address) : null),
    [address],
  );
  const nft = useMemo(() => (address ? getNftState(address) : null), [address]);
  const created = portfolio?.created ?? [];
  const ownedAssets = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    if (nft?.perk)
      out.push({
        id: `PERK-${nft.perk.level}`,
        label: `Perk NFT · Lvl ${nft.perk.level}`,
      });
    for (const g of nft?.genesis ?? [])
      out.push({
        id: g.id,
        label: `Genesis ${g.id} · ${(g.shareBps / 100).toFixed(1)}%`,
      });
    return out;
  }, [nft]);

  const kindMeta = KINDS.find((k) => k.id === kind)!;

  // What the confirm step previews: the genesis being minted, or the asset listed.
  const previewData: NftCardData =
    kind === "genesis"
      ? {
          kind: "genesis",
          shareBps: Math.max(1, Math.round(+sharePct * 100)),
          id: "GEN-0001",
        }
      : assetId.startsWith("PERK")
      ? {
          kind: "perk",
          level: nft?.perk?.level ?? 1,
          discountBps: nft?.perk?.discountBps ?? 100,
        }
      : {
          kind: "genesis",
          shareBps: nft?.genesis.find((g) => g.id === assetId)?.shareBps ?? 100,
          id: assetId || "GEN-0001",
        };
  const validGenesis = isAdmin && tokenHandle !== "" && +sharePct > 0 && +supply > 0;
  const validAuction = assetId !== "" && +startUsd > +floorUsd && +floorUsd > 0;
  const canContinue =
    step !== 1 || (kind === "genesis" ? validGenesis : validAuction);

  async function mint() {
    if (!program || !address) return setWalletOpen(true);
    setTxErr(null);
    setTx("pending");
    try {
      const asset = Keypair.generate();
      const me = new PublicKey(address);
      let sig: string;
      if (kind === "genesis") {
        const subjectMint = handleToMint(tokenHandle);
        if (!subjectMint) throw new Error("Launch this token on-chain first, then issue genesis NFTs.");
        const shareBps = Math.max(1, Math.round((+sharePct || 0) * 100));
        sig = await program.methods
          .mintGenesis(shareBps, "")
          .accounts({ authority: me, recipient: me, subjectMint, asset: asset.publicKey })
          .signers([asset])
          .rpc();
      } else {
        const toLamports = (usd: string) => new BN(Math.round(((+usd || 0) / SOL_USD) * 1e9));
        sig = await program.methods
          .startNftAuction(
            toLamports(startUsd),
            toLamports(floorUsd),
            new BN(DURATION_SEC[duration] ?? 86_400),
            assetId || "AttentionFi 1-of-1",
            "",
          )
          .accounts({ creator: me, asset: asset.publicKey })
          .signers([asset])
          .rpc();
      }
      setTxSig(sig);
      setTx("confirmed");
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transaction failed");
      setTx("failed");
    }
  }

  if (!connected) {
    return (
      <Shell>
        <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8 text-center">
          <div className="text-[15px] font-bold">
            Connect a wallet to create
          </div>
          <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-[#6B6B6B]">
            Issuing genesis NFTs or listing a 1-of-1 requires the wallet that
            owns the asset.
          </p>
          <button
            onClick={() => setWalletOpen(true)}
            className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]">
            Connect Wallet
          </button>
        </div>
        <WalletConnectModal
          open={walletOpen}
          onClose={() => setWalletOpen(false)}
        />
      </Shell>
    );
  }

  return (
    <Shell shortAddress={shortAddress}>
      {/* progress */}
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              i <= step ? "bg-signal" : "bg-white/10",
            )}
          />
        ))}
      </div>
      <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
        Step {step + 1} · {STEPS[step]}
      </div>

      <div className="mt-4">
        {/* 1 — type */}
        {step === 0 && (
          <div className="flex flex-col gap-2.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "rounded-sm border p-4 text-left transition-colors",
                  kind === k.id
                    ? "border-signal bg-signal/[0.06]"
                    : "border-white/[0.08] hover:border-white/20",
                )}>
                <div className="flex items-center gap-2">
                  <span className="text-signal">{k.icon}</span>
                  <span className="text-[13px] font-bold">{k.name}</span>
                  <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 font-mono text-[8px] text-[#6B6B6B]">
                    {k.tag}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#9aa4af]">
                  {k.desc}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* 2 — configure */}
        {step === 1 && kind === "genesis" && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Configure genesis</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              Each NFT earns its share of every fee your token collects, split
              pro-rata.
            </p>
            {!isAdmin && (
              <div className="mt-3 rounded-sm border border-noise/40 bg-noise/[0.06] px-3 py-2 text-[11px] leading-relaxed text-noise">
                Genesis issuance is protocol-admin-only in this build — the
                connected wallet isn&apos;t the program authority, so this
                transaction would be rejected on-chain.
              </div>
            )}
            <Field label="Token you created">
              {created.length ? (
                <select
                  value={tokenHandle}
                  onChange={(e) => setTokenHandle(e.target.value)}
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none">
                  <option value="">Select a token…</option>
                  {created.map((c) => (
                    <option key={c.handle} value={c.handle}>
                      @{c.handle} (${c.symbol})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-noise">
                  You haven&apos;t launched a token yet.
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Share per NFT (%)">
                <input
                  value={sharePct}
                  onChange={(e) =>
                    setSharePct(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  inputMode="decimal"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
              <Field label="Supply">
                <input
                  value={supply}
                  onChange={(e) =>
                    setSupply(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
            </div>
            <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
              Total allocated: {(+sharePct * +supply || 0).toFixed(1)}% of the
              fee stream
              {+sharePct * +supply > 100 && (
                <span className="text-noise"> · exceeds 100%</span>
              )}
            </div>
          </div>
        )}

        {step === 1 && kind === "auction" && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Configure auction</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              The price descends from start to floor over the duration. First
              buyer wins.
            </p>
            <Field label="Asset to list">
              {ownedAssets.length ? (
                <select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none">
                  <option value="">Select an asset…</option>
                  {ownedAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-noise">
                  You don&apos;t own any listable NFTs yet.
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start price ($)">
                <input
                  value={startUsd}
                  onChange={(e) =>
                    setStartUsd(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
              <Field label="Floor price ($)">
                <input
                  value={floorUsd}
                  onChange={(e) =>
                    setFloorUsd(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[13px] outline-none"
                />
              </Field>
            </div>
            {+floorUsd >= +startUsd && (
              <div className="mt-1 font-mono text-[10px] text-noise">
                Floor must be below the start price.
              </div>
            )}
            <Field label="Duration">
              <div className="flex gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      "rounded-sm border px-3 py-1.5 font-mono text-[11px]",
                      duration === d
                        ? "border-signal text-signal"
                        : "border-white/10 text-[#9aa4af]",
                    )}>
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* 3 — review */}
        {step === 2 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Review</div>
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <div className="w-44 max-w-full shrink-0">
                <NftCardFace data={previewData} />
              </div>
              <dl className="flex w-full flex-1 flex-col gap-2.5 font-mono text-[12px]">
              {(kind === "genesis"
                ? [
                    ["Type", kindMeta.name],
                    ["Token", `@${tokenHandle}`],
                    ["Share per NFT", `${sharePct}%`],
                    ["Supply", supply],
                    [
                      "Total allocated",
                      `${(+sharePct * +supply || 0).toFixed(1)}%`,
                    ],
                    ["Standard", "Metaplex Core"],
                  ]
                : [
                    ["Type", kindMeta.name],
                    ["Asset", assetId],
                    ["Start price", `$${(+startUsd).toLocaleString()}`],
                    ["Floor price", `$${(+floorUsd).toLocaleString()}`],
                    ["Duration", duration],
                    ["Standard", "Metaplex Core"],
                  ]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between border-b border-white/[0.06] pb-2 last:border-0">
                  <span className="text-[#6B6B6B]">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              </dl>
            </div>
          </div>
        )}

        {/* 4 — confirm */}
        {step === 3 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Confirm</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              {kind === "genesis"
                ? `Minting ${supply} genesis NFTs at ${sharePct}% each for @${tokenHandle}.`
                : `Listing ${assetId} from $${(+startUsd).toLocaleString()} down to $${(+floorUsd).toLocaleString()} over ${duration}.`}
            </p>

            {/* preview + params */}
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <div className="w-44 max-w-full shrink-0">
                <NftCardFace data={previewData} />
              </div>
              <dl className="flex w-full flex-1 flex-col gap-1.5 font-mono text-[11px]">
                {(kind === "genesis"
                  ? [
                      ["Token", `@${tokenHandle}`],
                      ["Share / NFT", `${sharePct}%`],
                      ["Supply", supply],
                      [
                        "Allocated",
                        `${(+sharePct * +supply || 0).toFixed(1)}%`,
                      ],
                    ]
                  : [
                      ["Asset", assetId],
                      ["Start", `$${(+startUsd).toLocaleString()}`],
                      ["Floor", `$${(+floorUsd).toLocaleString()}`],
                      ["Duration", duration],
                    ]
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between border-b border-white/[0.06] pb-1.5">
                    <span className="text-[#6B6B6B]">{k}</span>
                    <span className="truncate pl-2 text-[#F5F4F0]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-0.5">
                  <span className="text-[#6B6B6B]">Network fee</span>
                  <span className="text-[#F5F4F0]">~0.002 SOL</span>
                </div>
              </dl>
            </div>

            {/* auction price decay preview */}
            {kind === "auction" && (
              <div className="mt-4 rounded-sm border border-white/[0.06] bg-[#12181f] p-3">
                <div className="flex justify-between font-mono text-[9px] text-[#6B6B6B]">
                  <span>${(+startUsd).toLocaleString()} now</span>
                  <span>
                    ${(+floorUsd).toLocaleString()} at {duration}
                  </span>
                </div>
                <div className="mt-2 h-8 w-full">
                  <svg
                    viewBox="0 0 100 32"
                    preserveAspectRatio="none"
                    className="h-full w-full">
                    <defs>
                      <linearGradient id="decay" x1="0" x2="1">
                        <stop
                          offset="0"
                          stopColor="#00ff85"
                          stopOpacity="0.5"
                        />
                        <stop
                          offset="1"
                          stopColor="#00ff85"
                          stopOpacity="0.08"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,3 L100,29"
                      stroke="url(#decay)"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      d="M0,3 L100,29 L100,32 L0,32 Z"
                      fill="url(#decay)"
                      opacity="0.25"
                    />
                  </svg>
                </div>
                <div className="font-mono text-[9px] text-[#4b5563]">
                  price descends linearly · first buyer wins
                </div>
              </div>
            )}

            {/* what happens */}
            <div className="mt-4 rounded-sm border border-white/[0.06] bg-[#12181f] p-3 text-[11px] leading-relaxed text-[#6B6B6B]">
              {kind === "genesis"
                ? `On confirm, a Metaplex Core genesis NFT mints to your wallet at ${sharePct}% and a fee-share pool opens for @${tokenHandle}. Holders accrue their share of every trade fee and claim any time. (Batch minting of ${supply} comes later.)`
                : `On confirm, a Metaplex Core 1-of-1 is minted into the auction PDA and the descending price starts. It transfers to the first buyer automatically; you can cancel before a sale.`}
            </div>

            {tx ? (
              <div className="mt-4">
                <TxStatus
                  state={tx}
                  title={
                    tx === "pending"
                      ? kind === "genesis"
                        ? "Minting genesis…"
                        : "Listing asset…"
                      : tx === "failed"
                        ? "Transaction failed"
                        : kind === "genesis"
                          ? "Genesis minted"
                          : "Auction live"
                  }
                  detail={
                    tx === "failed" && txErr
                      ? txErr.slice(0, 90)
                      : kind === "genesis"
                        ? `@${tokenHandle} · genesis`
                        : `${assetId || "1-of-1"} · ${duration}`
                  }
                  signature={txSig ? `${txSig.slice(0, 4)}…${txSig.slice(-4)}` : undefined}
                  explorerUrl={txSig ? explorerTx(txSig) : undefined}
                  onRetry={tx === "failed" ? mint : undefined}
                />
                {tx === "confirmed" && (
                  <Link
                    href="/nft"
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-sm border border-signal/40 py-2.5 font-mono text-[11px] font-bold text-signal">
                    <Check className="h-3.5 w-3.5" /> View in NFTs
                  </Link>
                )}
              </div>
            ) : (
              <button
                onClick={mint}
                className="mt-4 w-full rounded-sm bg-signal py-3 font-mono text-[13px] font-bold text-[#0A0A0A]">
                {kind === "genesis" ? "MINT GENESIS" : "START AUCTION"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* nav — no scrim/box; the wizard is centred so it sits right under the card */}
      {step < 3 && (
        <div className="mt-5">
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-sm border border-white/15 px-4 py-3 font-mono text-[12px] font-bold text-[#F5F4F0]">
                Back
              </button>
            )}
            <button
              onClick={() => setStep((s) => Math.min(3, s + 1))}
              disabled={!canContinue}
              className="flex-1 rounded-sm bg-signal py-3 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-40">
              CONTINUE
            </button>
          </div>
        </div>
      )}
      <WalletConnectModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
      />
    </Shell>
  );
}

function Shell({
  children,
  shortAddress,
}: {
  children: React.ReactNode;
  shortAddress?: string | null;
}) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-80 [mask-image:radial-gradient(ellipse_at_center,#000_25%,transparent_85%)]">
        <PageBackground />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col px-5 py-6">
        <div className="flex items-center gap-2">
          <Link href="/nft" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-[15px] font-bold">Create an NFT</span>
          {shortAddress && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/[0.06] px-2.5 py-1 font-mono text-[10px] font-bold text-signal">
              <span className="af-pulse-dot h-1.5 w-1.5 rounded-full bg-signal" />
              {shortAddress}
            </span>
          )}
        </div>
        {/* top-aligned to match the token launch wizard; steps hold a min-height
            so a short step (Review) doesn't shrink sharply vs the others */}
        <div className="py-6">{children}</div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
