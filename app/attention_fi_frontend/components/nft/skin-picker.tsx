"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { SKINS, DEFAULT_SKIN_ID, skinById } from "@/lib/nft-skins";

/**
 * Restyle the caller's verification badge.
 *
 * Changing a skin is not a transaction: the asset's on-chain `uri` points at
 * /api/verification/<subject>, so the badge's artwork is resolved at read time.
 * The wallet still signs — but a message, not a transaction — which proves
 * ownership to the API without costing a fee or touching the update authority.
 */
export function SkinPicker({ subject }: { subject: string }) {
  const { getSigner } = useWallet();
  const [skin, setSkin] = useState<string>(DEFAULT_SKIN_ID);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/verification/skin?subject=${subject}`);
        const json: { skin?: string | null } = await res.json();
        if (!cancelled) setSkin(json.skin ?? DEFAULT_SKIN_ID);
      } catch {
        if (!cancelled) setSkin(DEFAULT_SKIN_ID);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);

  async function choose(id: string) {
    if (id === skin || saving) return;
    const signer = getSigner();
    if (!signer?.signMessage) {
      setErr("This wallet doesn't support message signing.");
      return;
    }
    setSaving(id);
    setErr(null);
    try {
      // Must match the server's skinMessage() exactly.
      const message = `Set my AttentionFi verification skin to "${id}" for ${subject}.`;
      const signed = await signer.signMessage(new TextEncoder().encode(message));
      const bytes = signed instanceof Uint8Array ? signed : signed.signature;
      const res = await fetch("/api/verification/skin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          skin: id,
          signature: Buffer.from(bytes).toString("base64"),
        }),
      });
      const json: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save skin");
      setSkin(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save skin");
    } finally {
      setSaving(null);
    }
  }

  const active = skinById(skin);

  return (
    <div className="mt-5 border-t border-white/[0.08] pt-4">
      <div className="text-[12px] font-bold">Badge skin</div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
        Changes the artwork only — the credential, its handle binding and what it gates are
        untouched. No transaction and no fee; your wallet signs a message to prove it&apos;s yours.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {SKINS.map((s) => {
          const isActive = loaded && s.id === skin;
          return (
            <button
              key={s.id}
              onClick={() => void choose(s.id)}
              disabled={saving !== null}
              title={s.blurb}
              className={cn(
                "flex items-center gap-2 rounded-sm border px-2.5 py-2 transition-colors disabled:opacity-50",
                isActive ? "border-signal bg-signal/10" : "border-white/10 hover:border-white/25",
              )}
            >
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-full border"
                style={{
                  background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
                  borderColor: s.accent,
                }}
              />
              <span
                className={cn(
                  "font-mono text-[11px]",
                  isActive ? "text-signal" : "text-[#6B6B6B]",
                )}
              >
                {saving === s.id ? "SAVING…" : s.name}
              </span>
            </button>
          );
        })}
      </div>

      {err && <p className="mt-2 font-mono text-[10px] text-noise">{err}</p>}

      <p className="mt-2 font-mono text-[10px] text-[#4b5563]">
        Current: {active.name} · wallets and explorers refresh within a minute.
      </p>
    </div>
  );
}
