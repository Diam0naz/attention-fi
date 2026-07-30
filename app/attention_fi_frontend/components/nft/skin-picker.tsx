"use client";

import { useEffect, useState } from "react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";
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

/**
 * Restyle the caller's verification badge.
 *
 * Skins are bought once and kept: the first time a wallet wears one it pays the
 * treasury, and every switch back to it afterwards is free. Applying is not an
 * on-chain write to the NFT — the asset's uri points at
 * /api/verification/<subject>, so the art is resolved at read time.
 *
 * Authorisation differs by path. A purchase is authorised by the payment
 * itself (you can't pay from a wallet you don't hold). A free re-apply has no
 * payment to lean on, so the wallet signs a message instead.
 */

const FEE_SOL = SKIN_FEE_LAMPORTS / 1_000_000_000;

/** What the picker is currently doing, so the UI can say which. */
type Phase = "paying" | "signing" | "applying";

const PHASE_COPY: Record<Phase, string> = {
  paying: "Confirming payment on-chain…",
  signing: "Waiting for your signature…",
  applying: "Applying the new look…",
};

/**
 * Build the bytes a wallet signs for a free switch, with the timestamp that
 * must be sent alongside them.
 *
 * At module scope deliberately: the clock read is impure, and inside the
 * component the compiler can't tell this only ever runs from a click.
 */
function buildSkinMessage(subject: string, skin: string): { bytes: Uint8Array; issuedAt: number } {
  const issuedAt = Date.now();
  return { bytes: new TextEncoder().encode(skinMessage(subject, skin, issuedAt)), issuedAt };
}

/** Parse a response that may not be JSON (a proxy error page, an empty 500). */
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

/**
 * A paid-for skin that hasn't been applied yet, kept in localStorage.
 *
 * The fee is spent before the API records anything, so if that call fails the
 * user is out of pocket with nothing to show. Persisting the signature means it
 * can be redeemed later — the server's redeem is atomic, so retrying the same
 * signature is always safe.
 */
interface PendingSkin {
  skin: string;
  signature: string;
}
const pendingKey = (subject: string) => `af.skin.pending.${subject}`;

function readPending(subject: string): PendingSkin | null {
  try {
    const raw = window.localStorage.getItem(pendingKey(subject));
    return raw ? (JSON.parse(raw) as PendingSkin) : null;
  } catch {
    return null;
  }
}

export function SkinPicker({
  subject,
  onSkinChange,
  onBusyChange,
}: {
  subject: string;
  /** Fired when the worn skin changes, so the card can restyle immediately. */
  onSkinChange?: (skin: string) => void;
  /** Fired while a change is in flight, so the card can show a loading state. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { getSigner } = useWallet();
  const program = useProgram();
  const [skin, setSkin] = useState<string>(DEFAULT_SKIN_ID);
  const [owned, setOwned] = useState<string[]>([DEFAULT_SKIN_ID]);
  const [customUri, setCustomUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; phase: Phase } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingSkin | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/verification/skin?subject=${subject}`);
        const json = await readJson(res);
        if (!cancelled) {
          const current = json.skin ?? DEFAULT_SKIN_ID;
          setSkin(current);
          setOwned(json.owned ?? [DEFAULT_SKIN_ID]);
          setCustomUri(json.customUri ?? null);
          // Report on load too, not just on change: a wallet already wearing a
          // skin would otherwise see its card rendered in the default palette.
          onSkinChange?.(current);
        }
      } catch {
        if (!cancelled) setSkin(DEFAULT_SKIN_ID);
      } finally {
        if (!cancelled) {
          // Surface any fee already paid whose skin never landed, so it can be
          // redeemed rather than quietly lost.
          setPending(readPending(subject));
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject, onSkinChange]);

  function begin(id: string, phase: Phase) {
    setBusy({ id, phase });
    onBusyChange?.(true);
  }
  function end() {
    setBusy(null);
    onBusyChange?.(false);
  }

  function land(id: string) {
    setSkin(id);
    setOwned((prev) => (prev.includes(id) ? prev : [...prev, id]));
    onSkinChange?.(id);
    clearPending();
  }

  function clearPending() {
    setPending(null);
    try {
      window.localStorage.removeItem(pendingKey(subject));
    } catch {
      // Private-mode storage failure isn't worth surfacing.
    }
  }

  /** Redeem an already-paid signature. Safe to call repeatedly. */
  async function redeem(id: string, signature: string): Promise<void> {
    const res = await fetch("/api/verification/skin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, skin: id, signature }),
    });
    const json = await readJson(res);
    // 409 means this signature was already consumed — the purchase did land,
    // so treat it as success rather than stranding the user in a retry loop.
    if (res.status === 409) return land(id);
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save skin");
    land(id);
  }

  /** Wear a skin this wallet already owns — no charge, signature as proof. */
  async function wearOwned(id: string, uri?: string): Promise<void> {
    const provider = getSigner();
    if (!provider?.signMessage) {
      throw new Error("This wallet can't sign messages, so a free switch isn't possible.");
    }
    begin(id, "signing");
    const { bytes: encoded, issuedAt } = buildSkinMessage(subject, id);
    const raw = await provider.signMessage(encoded);
    // Wallets disagree on the shape here: some return the bytes, some wrap them.
    const bytes = raw instanceof Uint8Array ? raw : raw.signature;

    begin(id, "applying");
    const res = await fetch("/api/verification/skin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        skin: id,
        messageSignature: bs58.encode(bytes),
        issuedAt,
        ...(uri ? { customUri: uri } : {}),
      }),
    });
    const json = await readJson(res);
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not apply skin");
    if (uri) setCustomUri(uri);
    land(id);
  }

  /** Buy a skin for the first time. */
  async function buy(id: string): Promise<void> {
    if (!program) throw new Error("Connect a wallet to change your skin.");
    const global = await fetchGlobal(program);
    if (!global?.treasury) throw new Error("Couldn't read the protocol treasury.");

    begin(id, "paying");
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(subject),
        toPubkey: new PublicKey(global.treasury),
        lamports: SKIN_FEE_LAMPORTS,
      }),
    );
    const signature = await program.provider.sendAndConfirm!(tx, [], {
      commitment: "confirmed",
    });

    // Recorded before the API call, not after: if that call fails the fee is
    // already spent, and this is what makes it recoverable.
    const record: PendingSkin = { skin: id, signature };
    try {
      window.localStorage.setItem(pendingKey(subject), JSON.stringify(record));
    } catch {
      // Storage unavailable — the retry banner just won't survive a reload.
    }
    setPending(record);

    begin(id, "applying");
    await redeem(id, signature);
  }

  async function choose(id: string, uri?: string) {
    if (busy) return;
    // Signature can be re-applied with new artwork while already worn.
    if (id === skin && id !== CUSTOM_SKIN_ID) return;
    if (!program) {
      setErr("Connect a wallet to change your skin.");
      return;
    }
    setErr(null);
    try {
      // Signature is earned, never sold — it must not reach the purchase path.
      if (owned.includes(id) || id === CUSTOM_SKIN_ID) await wearOwned(id, uri);
      else await buy(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save skin");
    } finally {
      end();
    }
  }

  /** Redeem a payment whose skin never landed. */
  async function retryPending() {
    if (!pending || busy) return;
    begin(pending.skin, "applying");
    setErr(null);
    try {
      await redeem(pending.skin, pending.signature);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Still couldn't apply it — try again shortly.");
    } finally {
      end();
    }
  }

  const active = skinById(skin);

  return (
    <div className="mt-5 border-t border-white/[0.08] pt-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[12px] font-bold">Badge skin</div>
        <div className="font-mono text-[10px] text-signal">{FEE_SOL} SOL · yours forever</div>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
        Changes the artwork only — the credential, its handle binding and what it gates are
        untouched. Each skin is bought once and stays unlocked, so switching between ones you
        already own is free.
      </p>

      {/* Progress is stated rather than implied by a disabled grid: a purchase
          spans a wallet prompt, a confirmation and a write, and going quiet
          through all three reads as a hang. */}
      {busy && (
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-signal/30 bg-signal/[0.06] px-3 py-2.5">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-signal" />
          <span className="font-mono text-[10px] text-[#F5F4F0]">
            {PHASE_COPY[busy.phase]}{" "}
            <span className="text-[#6B6B6B]">({skinById(busy.id).name})</span>
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {SKINS.map((s) => {
          const isActive = loaded && s.id === skin;
          const isOwned = owned.includes(s.id);
          const isBusy = busy?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => void choose(s.id)}
              disabled={busy !== null}
              title={isOwned ? s.blurb : `${s.blurb} — ${FEE_SOL} SOL to unlock`}
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
                {s.name}
              </span>
              {isBusy ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-signal" />
              ) : isActive ? (
                <Check className="h-3 w-3 shrink-0 text-signal" />
              ) : isOwned ? (
                <span className="font-mono text-[9px] text-[#4b5563]">OWNED</span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[9px] text-[#4b5563]">
                  <Lock className="h-2.5 w-2.5" />
                  {FEE_SOL}
                </span>
              )}
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

      {pending && pending.skin !== skin && (
        <div className="mt-3 rounded-sm border border-signal/30 bg-signal/[0.06] p-3">
          <div className="font-mono text-[10px] leading-relaxed text-[#F5F4F0]">
            You already paid for <span className="text-signal">{skinById(pending.skin).name}</span>{" "}
            but it didn&apos;t apply — usually the database was briefly asleep. Your{" "}
            {FEE_SOL} SOL isn&apos;t lost; claim it for free.
          </div>
          <button
            onClick={() => void retryPending()}
            disabled={busy !== null}
            className="mt-2 rounded-sm bg-signal px-3 py-1.5 font-mono text-[10px] font-bold text-[#0A0A0A] disabled:opacity-40"
          >
            {busy ? "APPLYING…" : "CLAIM IT (NO CHARGE)"}
          </button>
        </div>
      )}

      {err && <p className="mt-2 font-mono text-[10px] leading-relaxed text-noise">{err}</p>}

      <p className="mt-2 font-mono text-[10px] text-[#4b5563]">
        Wearing {skin === CUSTOM_SKIN_ID ? CUSTOM_SKIN.name : active.name} ·{" "}
        {owned.filter((o) => o !== CUSTOM_SKIN_ID).length} of {SKINS.length} unlocked · wallets
        and explorers refresh within a minute.
      </p>
    </div>
  );
}
