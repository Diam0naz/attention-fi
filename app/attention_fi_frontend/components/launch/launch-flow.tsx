"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifyHandleFlow } from "@/components/onboarding/verify-handle-flow";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { PageBackground } from "@/components/reactbits/page-background";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useProgram } from "@/lib/solana/use-program";
import { registerToken } from "@/lib/solana/registry";
import { explorerTx } from "@/lib/solana/config";

type MechId = "bonding" | "dutch" | "conviction" | "revenue";

const MECHANISMS: { id: MechId; name: string; badge?: string; desc: string }[] = [
  { id: "bonding", name: "Bonding Curve", badge: "DEFAULT", desc: "Mindshare-seeded price, graduates to a native AMM." },
  { id: "dutch", name: "Dutch Auction", desc: "Price starts high and descends until the allocation fills — no front-running edge." },
  { id: "conviction", name: "Conviction Curve", desc: "Slower rise with a time-lock; early exits forfeit a penalty." },
  { id: "revenue", name: "Revenue Share", desc: "The token is a pro-rata claim on the subject's fee stream." },
];

// Mindshare tier → seed market cap (mirrors the program's seed tiers).
const TIERS = [
  { min: 3, tier: "Top 10", seed: "$15,000" },
  { min: 1, tier: "Top 100", seed: "$4,000" },
  { min: 0.4, tier: "Emerging", seed: "$800" },
  { min: 0, tier: "New", seed: "$69" },
];
const tierFor = (m: number) => TIERS.find((t) => m >= t.min) ?? TIERS[TIERS.length - 1];

// UI tier label → on-chain MindshareTier enum arg.
const TIER_ARG: Record<string, object> = {
  "Top 10": { top10: {} },
  "Top 100": { top100: {} },
  Emerging: { emerging: {} },
  New: { newEntrant: {} },
};

const STEPS = ["Mechanism", "Verify", "Seed & review", "Confirm"];

export function LaunchFlow() {
  const { connected, shortAddress, address } = useWallet();
  const program = useProgram();
  const [step, setStep] = useState(0); // 0..3
  const [mech, setMech] = useState<MechId>("bonding");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  // Wallet is connected (1); start on "awaiting signature" (2) so the SIGN button shows.
  const [verifyStep, setVerifyStep] = useState<2 | 3>(2);
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  const mindshare = 0.98; // mock: fetched from Kaito for the handle
  const t = tierFor(mindshare);
  const mechName = MECHANISMS.find((m) => m.id === mech)!.name;
  // Symbol defaults to the token name (or handle) if the creator leaves it blank.
  const ticker = (symbol || name || handle).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  const canContinue = step !== 0 || (handle.trim().length > 0 && name.trim().length > 0);

  function next() {
    if (step === 1 && verifyStep < 3) return; // must finish verify
    setStep((s) => Math.min(3, s + 1));
  }

  async function launch() {
    // Only the bonding curve is wired on-chain (launch_token). Other mechanisms
    // stay a mock preview until their instructions are wired.
    if (mech !== "bonding") {
      setTx("pending");
      setTimeout(() => setTx("confirmed"), 1500);
      return;
    }
    if (!program || !address) return setWalletOpen(true);
    setTxErr(null);
    setTx("pending");
    try {
      const mint = Keypair.generate();
      const sig = await program.methods
        .launchToken(TIER_ARG[t.tier] as never)
        .accounts({ creator: new PublicKey(address), mint: mint.publicKey })
        .signers([mint])
        .rpc();
      registerToken(handle, mint.publicKey.toBase58());
      setTxSig(sig);
      setTx("confirmed");
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Launch failed");
      setTx("failed");
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-80 [mask-image:radial-gradient(ellipse_at_center,#000_25%,transparent_85%)]">
        <PageBackground />
      </div>
      <div className="relative mx-auto min-h-screen max-w-lg px-5 py-6">
      {/* header + progress */}
      <div className="flex items-center gap-2">
        <Link href="/" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-[15px] font-bold">Launch a token</span>
        {connected ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/[0.06] px-2.5 py-1 font-mono text-[10px] font-bold text-signal">
            <span className="h-1.5 w-1.5 rounded-full bg-signal af-pulse-dot" />
            {shortAddress}
          </span>
        ) : (
          <button
            onClick={() => setWalletOpen(true)}
            className="ml-auto rounded-sm bg-signal px-3 py-1 font-mono text-[10px] font-bold text-[#0A0A0A]"
          >
            Connect Wallet
          </button>
        )}
      </div>
      <div className="mt-4 flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn("h-[3px] flex-1 rounded-full", i <= step ? "bg-signal" : "bg-white/10")}
          />
        ))}
      </div>
      <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
        Step {step + 1} · {STEPS[step]}
      </div>

      <div className="mt-4">
        {/* Step 1 — mechanism + handle */}
        {step === 0 && (
          <div className="flex flex-col gap-2.5">
            {MECHANISMS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMech(m.id)}
                className={cn(
                  "rounded-sm border p-3.5 text-left transition-colors",
                  mech === m.id ? "border-signal bg-signal/[0.06]" : "border-white/[0.08] hover:border-white/20",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold">{m.name}</span>
                  {m.badge && (
                    <span className="rounded-sm bg-signal px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#0A0A0A]">
                      {m.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#9aa4af]">{m.desc}</p>
              </button>
            ))}
            <label className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
              X account this token represents
            </label>
            <div className="flex items-center rounded-sm border border-white/10 bg-[#12181f] px-3">
              <span className="text-[#6B6B6B]">@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="handle"
                className="w-full bg-transparent px-1.5 py-2.5 text-[13px] outline-none placeholder:text-[#4b5563]"
              />
            </div>

            <div className="mt-1 grid grid-cols-[1fr_120px] gap-2">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Token name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 32))}
                  placeholder="e.g. Solana KOL"
                  className="mt-1 w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none placeholder:text-[#4b5563]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Symbol
                </label>
                <div className="mt-1 flex items-center rounded-sm border border-white/10 bg-[#12181f] px-3">
                  <span className="text-[#6B6B6B]">$</span>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6))}
                    placeholder={ticker || "TICKER"}
                    className="w-full bg-transparent px-1 py-2.5 font-mono text-[13px] uppercase outline-none placeholder:text-[#4b5563]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — verify handle */}
        {step === 1 &&
          (connected ? (
            <VerifyHandleFlow
              handle={handle || "handle"}
              walletAddress={shortAddress ?? ""}
              step={verifyStep}
              onSign={() => setVerifyStep(3)}
            />
          ) : (
            <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6 text-center">
              <div className="text-[13px] font-bold">Connect a wallet to verify</div>
              <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-[#6B6B6B]">
                Verification binds @{handle || "your handle"} to your wallet on-chain — connect the
                wallet that will own the creator-fee address.
              </p>
              <button
                onClick={() => setWalletOpen(true)}
                className="mt-4 rounded-sm bg-signal px-5 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
              >
                Connect Wallet
              </button>
            </div>
          ))}

        {/* Step 3 — seed & review */}
        {step === 2 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Seed & review</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              @{handle} sits at {mindshare}% mindshare → tier <span className="text-signal">{t.tier}</span>.
              The curve seeds at that price instead of zero.
            </p>
            <dl className="mt-4 flex flex-col gap-2.5 font-mono text-[12px]">
              {[
                ["Token", `${name || handle} ($${ticker})`],
                ["Mechanism", mechName],
                ["Seed market cap", t.seed],
                ["Total supply", "1,000,000,000"],
                ["Graduation at", "$69,000"],
                ["Creator fee", "0.5% (claimable once verified)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-white/[0.06] pb-2 last:border-0">
                  <span className="text-[#6B6B6B]">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Step 4 — confirm & launch */}
        {step === 3 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Confirm & launch</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              Launching <span className="text-[#F5F4F0]">{name || handle} (${ticker})</span>, a{" "}
              <span className="text-[#F5F4F0]">{mechName}</span> token for{" "}
              <span className="text-[#F5F4F0]">@{handle}</span>, seeded at {t.seed}.
            </p>

            {tx ? (
              <div className="mt-4">
                <TxStatus
                  state={tx}
                  title={
                    tx === "pending" ? "Launching…" : tx === "failed" ? "Launch failed" : "Token launched"
                  }
                  detail={tx === "failed" && txErr ? txErr.slice(0, 90) : `$${ticker} · ${mechName}`}
                  signature={txSig ? `${txSig.slice(0, 4)}…${txSig.slice(-4)}` : undefined}
                  explorerUrl={txSig ? explorerTx(txSig) : undefined}
                  onRetry={tx === "failed" ? launch : undefined}
                />
                {tx === "confirmed" && (
                  <Link
                    href={`/token/${handle}`}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-sm border border-signal/40 py-2.5 font-mono text-[11px] font-bold text-signal"
                  >
                    <Check className="h-3.5 w-3.5" /> View token page
                  </Link>
                )}
              </div>
            ) : (
              <button
                onClick={launch}
                className="mt-4 w-full rounded-sm bg-signal py-3 font-mono text-[13px] font-bold text-[#0A0A0A]"
              >
                LAUNCH ${ticker}
              </button>
            )}
          </div>
        )}
      </div>

      {/* nav — Back on any step past the first; CONTINUE except while awaiting the signature */}
      {step < 3 && (
        <div className="sticky bottom-0 mt-6 py-4">
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-sm border border-white/15 px-4 py-3 font-mono text-[12px] font-bold text-[#F5F4F0]"
              >
                Back
              </button>
            )}
            {!(step === 1 && verifyStep < 3) && (
              <button
                onClick={next}
                disabled={!canContinue}
                className="flex-1 rounded-sm bg-signal py-3 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-40"
              >
                CONTINUE
              </button>
            )}
          </div>
        </div>
      )}

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </div>
    </>
  );
}
