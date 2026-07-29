"use client";

import { useEffect, useState } from "react";
import bs58 from "bs58";
import { Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { SKINS, DEFAULT_SKIN_ID, skinById, skinMessage } from "@/lib/nft-skins";

/**
 * Restyle one perk or genesis NFT.
 *
 * Unlike the verification badge, these classes are keyed by asset — a wallet
 * can hold several — so the skin is chosen per NFT. Unlocking is still
 * wallet-wide: buy a skin once on your badge and wear it on anything you hold.
 * That means there's no payment here, and a signed message stands in as proof
 * of wallet control.
 */

type Phase = "signing" | "applying";

const PHASE_COPY: Record<Phase, string> = {
  signing: "Waiting for your signature…",
  applying: "Applying the new look…",
};

/**
 * Message bytes plus the timestamp sent alongside them. Module scope because
 * the clock read is impure and the compiler can't tell this only runs from a
 * click.
 */
function buildMessage(asset: string, skin: string): { bytes: Uint8Array; issuedAt: number } {
  const issuedAt = Date.now();
  return { bytes: new TextEncoder().encode(skinMessage(asset, skin, issuedAt)), issuedAt };
}

async function readJson(
  res: Response,
): Promise<{ ok?: boolean; error?: string; skin?: string | null; owned?: string[] }> {
  const text = await res.text();
  if (!text) return { error: `Request failed (${res.status})` };
  try {
    return JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    return { error: `Unexpected response (${res.status})` };
  }
}

export function AssetSkinPicker({
  cls,
  asset,
  owner,
  onSkinChange,
}: {
  cls: "perk" | "genesis";
  asset: string;
  owner: string;
  onSkinChange?: (skin: string) => void;
}) {
  const { getSigner } = useWallet();
  const [skin, setSkin] = useState<string>(DEFAULT_SKIN_ID);
  const [owned, setOwned] = useState<string[]>([DEFAULT_SKIN_ID]);
  const [busy, setBusy] = useState<{ id: string; phase: Phase } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/nft/skin?class=${cls}&asset=${asset}&owner=${owner}`,
        );
        const json = await readJson(res);
        if (!cancelled) {
          const current = json.skin ?? DEFAULT_SKIN_ID;
          setSkin(current);
          setOwned(json.owned ?? [DEFAULT_SKIN_ID]);
          onSkinChange?.(current);
        }
      } catch {
        // Leave the default; the card simply renders unstyled.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cls, asset, owner, onSkinChange]);

  async function choose(id: string) {
    if (id === skin || busy) return;
    if (!owned.includes(id)) {
      setErr("Unlock this skin on your verification badge first — then it's yours to wear here.");
      return;
    }
    const provider = getSigner();
    if (!provider?.signMessage) {
      setErr("This wallet can't sign messages, so skins can't be changed here.");
      return;
    }

    setErr(null);
    setBusy({ id, phase: "signing" });
    try {
      const { bytes, issuedAt } = buildMessage(asset, id);
      const raw = await provider.signMessage(bytes);
      // Wallets disagree on the shape: some return bytes, some wrap them.
      const sig = raw instanceof Uint8Array ? raw : raw.signature;

      setBusy({ id, phase: "applying" });
      const res = await fetch("/api/nft/skin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class: cls,
          asset,
          skin: id,
          owner,
          messageSignature: bs58.encode(sig),
          issuedAt,
        }),
      });
      const json = await readJson(res);
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not apply skin");
      setSkin(id);
      onSkinChange?.(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not apply skin");
    } finally {
      setBusy(null);
    }
  }

  const active = skinById(skin);
  const lockedCount = SKINS.length - owned.length;

  return (
    <div className="mt-4 border-t border-white/[0.08] pt-3.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[12px] font-bold">Card skin</div>
        {lockedCount > 0 && (
          <div className="font-mono text-[10px] text-[#6B6B6B]">{lockedCount} locked</div>
        )}
      </div>

      {busy && (
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-signal/30 bg-signal/[0.06] px-3 py-2">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-signal" />
          <span className="font-mono text-[10px] text-[#F5F4F0]">{PHASE_COPY[busy.phase]}</span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SKINS.map((s) => {
          const isActive = loaded && s.id === skin;
          const isOwned = owned.includes(s.id);
          const isBusy = busy?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => void choose(s.id)}
              disabled={busy !== null}
              title={isOwned ? s.blurb : `${s.name} — unlock on your verification badge`}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2 py-1.5 transition-colors disabled:opacity-50",
                isActive ? "border-signal bg-signal/10" : "border-white/10 hover:border-white/25",
                !isOwned && "opacity-60",
              )}
            >
              <span
                aria-hidden
                className="h-4 w-4 shrink-0 rounded-full border"
                style={{
                  background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
                  borderColor: s.accent,
                }}
              />
              <span
                className={cn("font-mono text-[10px]", isActive ? "text-signal" : "text-[#6B6B6B]")}
              >
                {s.name}
              </span>
              {isBusy ? (
                <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-signal" />
              ) : isActive ? (
                <Check className="h-2.5 w-2.5 shrink-0 text-signal" />
              ) : !isOwned ? (
                <Lock className="h-2.5 w-2.5 shrink-0 text-[#4b5563]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {err && <p className="mt-2 font-mono text-[10px] leading-relaxed text-noise">{err}</p>}

      <p className="mt-2 font-mono text-[10px] text-[#4b5563]">
        Wearing {active.name} · free to switch between skins you&apos;ve unlocked.
      </p>
    </div>
  );
}
