"use client";

import { useEffect, useState } from "react";
import bs58 from "bs58";
import { Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import {
  SKINS,
  CUSTOM_SKIN,
  CUSTOM_SKIN_ID,
  DEFAULT_SKIN_ID,
  SKIN_FEE_LAMPORTS,
  skinById,
  skinMessage,
} from "@/lib/nft-skins";
import { SignatureField } from "@/components/nft/signature-field";
import { useProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

/**
 * Restyle one perk or genesis NFT.
 *
 * Unlike the verification badge, these classes are keyed by asset — a wallet
 * can hold several — so the skin is chosen per NFT. Unlocking stays
 * wallet-wide: buy a skin once and wear it on anything you hold, here or on
 * the badge.
 *
 * Two authorisations, because the two actions differ. Buying is authorised by
 * the payment itself; wearing something already unlocked has no payment to
 * lean on, so the wallet signs a message that names the asset.
 */

type Phase = "paying" | "signing" | "applying";

const PHASE_COPY: Record<Phase, string> = {
  paying: "Confirming payment on-chain…",
  signing: "Waiting for your signature…",
  applying: "Applying the new look…",
};

const FEE_SOL = SKIN_FEE_LAMPORTS / 1_000_000_000;

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
): Promise<{
  ok?: boolean;
  error?: string;
  skin?: string | null;
  customUri?: string | null;
  owned?: string[];
}> {
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
  const program = useProgram();
  const [skin, setSkin] = useState<string>(DEFAULT_SKIN_ID);
  const [customUri, setCustomUri] = useState<string | null>(null);
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
          setCustomUri(json.customUri ?? null);
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

  /**
   * Unlock a skin by paying the treasury.
   *
   * Buying used to live only on the verification badge, which left this picker
   * a dead end for any wallet without one: every tile locked, and clicking did
   * nothing. Unlocking is wallet-level, so it belongs here too.
   */
  async function unlock(id: string): Promise<void> {
    if (!program) throw new Error("Connect a wallet to unlock skins.");
    const global = await fetchGlobal(program);
    if (!global?.treasury) throw new Error("Couldn't read the protocol treasury.");

    setBusy({ id, phase: "paying" });
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(owner),
        toPubkey: new PublicKey(global.treasury),
        lamports: SKIN_FEE_LAMPORTS,
      }),
    );
    const signature = await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });

    const res = await fetch("/api/skins/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, skin: id, signature }),
    });
    const json = await readJson(res);
    // 409 means the signature was already redeemed — the unlock landed.
    if (!res.ok && res.status !== 409) throw new Error(json.error ?? "Could not unlock skin");
    setOwned((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  async function choose(id: string, uri?: string) {
    if (busy) return;
    if (id === skin && id !== CUSTOM_SKIN_ID) return;
    const provider = getSigner();
    if (!provider?.signMessage) {
      setErr("This wallet can't sign messages, so skins can't be changed here.");
      return;
    }

    setErr(null);
    try {
      // Signature is earned, never sold, so it's the one id that must not be
      // routed through a purchase.
      if (!owned.includes(id) && id !== CUSTOM_SKIN_ID) await unlock(id);

      setBusy({ id, phase: "signing" });
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
          ...(uri ? { customUri: uri } : {}),
        }),
      });
      const json = await readJson(res);
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not apply skin");
      setSkin(id);
      if (uri) setCustomUri(uri);
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
              title={isOwned ? s.blurb : `${s.name} — ${FEE_SOL} SOL to unlock, yours forever`}
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
                <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[9px] text-[#4b5563]">
                  <Lock className="h-2.5 w-2.5" />
                  {FEE_SOL}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <SignatureField
        owned={owned}
        active={skin === CUSTOM_SKIN_ID}
        currentUri={customUri}
        busy={busy?.id === CUSTOM_SKIN_ID}
        onApply={(uri) => void choose(CUSTOM_SKIN_ID, uri)}
      />

      {err && <p className="mt-2 font-mono text-[10px] leading-relaxed text-noise">{err}</p>}

      <p className="mt-2 font-mono text-[10px] text-[#4b5563]">
        Wearing {skin === CUSTOM_SKIN_ID ? CUSTOM_SKIN.name : active.name} · free to switch
        between skins you&apos;ve unlocked.
      </p>
    </div>
  );
}
