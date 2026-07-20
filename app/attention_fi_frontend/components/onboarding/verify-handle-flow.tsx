"use client";

export interface VerifyHandleFlowProps {
  handle: string;
  walletAddress: string;
  /** 1 = wallet connected, 2 = awaiting signature, 3 = attestation issued */
  step: 1 | 2 | 3;
  onSign: () => void;
}

function StepDot({ done, active, index }: { done: boolean; active: boolean; index: number }) {
  if (done) {
    return (
      <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-signal text-[11px] font-bold text-[#0A0A0A]">
        ✓
      </span>
    );
  }
  return (
    <span
      className={
        active
          ? "flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-signal text-[10px] font-bold text-[#0A0A0A]"
          : "flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-[#6B6B6B]"
      }
    >
      {index}
    </span>
  );
}

export function VerifyHandleFlow({ handle, walletAddress, step, onSign }: VerifyHandleFlowProps) {
  return (
    <div className="rounded-sm border border-white/10 bg-[#0f1620] p-5">
      <div className="text-[14px] font-bold">Verify your X handle</div>
      <p className="mt-1 text-[12px] leading-relaxed text-[#6B6B6B]">
        One signature binds @{handle} to your wallet on-chain — required to claim creator fees.
      </p>

      <div className="mt-4.5 flex flex-col">
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <StepDot done={step > 1} active={step === 1} index={1} />
            <span className="my-1 w-px flex-1 bg-white/10" />
          </div>
          <div className="pb-5">
            <div className="text-[12.5px] font-bold">Wallet connected</div>
            <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">{walletAddress}</div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <StepDot done={step > 2} active={step === 2} index={2} />
            <span className="my-1 w-px flex-1 bg-white/10" />
          </div>
          <div className="flex-1 pb-5">
            <div className="text-[12.5px] font-bold">Sign to prove @{handle}</div>
            <div className="mt-1.5 rounded-sm border border-white/[0.08] bg-[#12181f] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[#9aa4af]">
              &quot;I am @{handle} and I authorize AttentionFi to attest this handle to {walletAddress}.&quot;
            </div>
            {step === 2 && (
              <button
                onClick={onSign}
                className="mt-2.5 rounded-sm bg-signal px-4 py-2 font-mono text-[11.5px] font-bold text-[#0A0A0A]"
              >
                SIGN &amp; VERIFY
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <StepDot done={step > 2 && step === 3} active={false} index={3} />
          <div>
            <div className={step === 3 ? "text-[12.5px] font-bold" : "text-[12.5px] font-bold text-[#6B6B6B]"}>
              Attestation credential issued
            </div>
            <p className="mt-0.5 text-[11px] text-[#6B6B6B]">
              A soulbound SAS credential mints to your wallet — this is what gates creator-fee claims.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
