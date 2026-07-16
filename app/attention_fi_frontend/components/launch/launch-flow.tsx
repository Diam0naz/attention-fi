"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifyHandleFlow } from "@/components/onboarding/verify-handle-flow";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";

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

const STEPS = ["Mechanism", "Verify", "Seed & review", "Confirm"];

export function LaunchFlow() {
  const [step, setStep] = useState(0); // 0..3
  const [mech, setMech] = useState<MechId>("bonding");
  const [handle, setHandle] = useState("");
  // Wallet is connected (1); start on "awaiting signature" (2) so the SIGN button shows.
  const [verifyStep, setVerifyStep] = useState<2 | 3>(2);
  const [tx, setTx] = useState<TxState | null>(null);

  const mindshare = 0.98; // mock: fetched from Kaito for the handle
  const t = tierFor(mindshare);
  const mechName = MECHANISMS.find((m) => m.id === mech)!.name;
  const canContinue = step !== 0 || handle.trim().length > 0;

  function next() {
    if (step === 1 && verifyStep < 3) return; // must finish verify
    setStep((s) => Math.min(3, s + 1));
  }

  function launch() {
    setTx("pending");
    setTimeout(() => setTx("confirmed"), 1800);
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 py-6">
      {/* header + progress */}
      <div className="flex items-center gap-2">
        <Link href="/" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-[15px] font-bold">Launch a token</span>
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
          </div>
        )}

        {/* Step 2 — verify handle */}
        {step === 1 && (
          <VerifyHandleFlow
            handle={handle || "handle"}
            walletAddress="8XZQ…eJ96"
            step={verifyStep}
            onSign={() => setVerifyStep(3)}
          />
        )}

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
              Launching a <span className="text-[#F5F4F0]">{mechName}</span> token for{" "}
              <span className="text-[#F5F4F0]">@{handle}</span>, seeded at {t.seed}.
            </p>

            {tx ? (
              <div className="mt-4">
                <TxStatus
                  state={tx}
                  title={tx === "pending" ? "Launching…" : "Token launched"}
                  detail={`@${handle} · ${mechName}`}
                  signature="3xРq…8kQ2"
                  explorerUrl="#"
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
                LAUNCH ${handle.slice(0, 4).toUpperCase()}
              </button>
            )}
          </div>
        )}
      </div>

      {/* nav — Back on any step past the first; CONTINUE except while awaiting the signature */}
      {step < 3 && (
        <div className="sticky bottom-0 mt-6 border-t border-white/[0.08] bg-[#0A0A0A] py-4">
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
    </div>
  );
}
