"use client";

import { cn } from "@/lib/utils";

export interface NotificationPref {
  id: string;
  label: string;
  enabled: boolean;
}

export interface SettingsPanelProps {
  handle: string;
  verified: boolean;
  feeTier: string;
  walletAddress: string;
  prefs: NotificationPref[];
  onTogglePref: (id: string) => void;
  onDisconnect: () => void;
}

function Toggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onClick}
      className={cn(
        "relative h-4 w-[30px] shrink-0 rounded-full transition-colors",
        enabled ? "bg-signal" : "bg-white/10",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3 w-3 rounded-full bg-[#0A0A0A] transition-all",
          enabled ? "left-[15px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function SettingsPanel({
  handle,
  verified,
  feeTier,
  walletAddress,
  prefs,
  onTogglePref,
  onDisconnect,
}: SettingsPanelProps) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620]">
      <div className="flex items-center gap-3.5 border-b border-white/[0.06] px-6 py-5">
        <div className="h-11 w-11 shrink-0 rounded-full bg-white/10" aria-hidden />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold">@{handle}</span>
            {verified && (
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-signal text-[8px] font-bold text-[#0A0A0A]">
                ✓
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
            {verified ? "SAS-verified" : "Unverified"} · fee tier {feeTier}
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.06] px-6 py-5">
        <div className="mb-3 font-mono text-[10px] tracking-[0.1em] text-[#6B6B6B]">NOTIFICATIONS</div>
        <div className="flex flex-col gap-3">
          {prefs.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-[13px]">
              <span>{p.label}</span>
              <Toggle enabled={p.enabled} onClick={() => onTogglePref(p.id)} />
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="mb-3 font-mono text-[10px] tracking-[0.1em] text-[#6B6B6B]">CONNECTED WALLET</div>
        <div className="flex items-center gap-2.5 rounded-sm border border-white/[0.08] px-3.5 py-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-signal" />
          <span className="flex-1 font-mono text-[12px]">{walletAddress}</span>
          <button onClick={onDisconnect} className="font-mono text-[10.5px] text-noise">
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
