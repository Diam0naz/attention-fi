"use client";

import { useEffect, useState } from "react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useProgram } from "@/lib/solana/use-program";
import { fetchGlobal } from "@/lib/solana/curve";
import { SKINS, DEFAULT_SKIN_ID, SKIN_FEE_LAMPORTS, skinById } from "@/lib/nft-skins";

/**
 * Restyle the caller's verification badge.
 *
 * Applying a skin is not an on-chain write to the NFT — the asset's uri points
 * at /api/verification/<subject>, so the art is resolved at read time. What is
 * on-chain is the fee: a transfer to the treasury, whose signature the API
 * verifies before applying the change. Paying from the verified wallet is also
 * what proves ownership, so no separate message signature is needed.
 */

const FEE_SOL = SKIN_FEE_LAMPORTS / 1_000_000_000;

/** Parse a response that may not be JSON (a proxy error page, an empty 500). */
async function readJson(res: Response): Promise<{ ok?: boolean; error?: string; skin?: string | null }> {
  const text = await res.text();
  if (!text) return { error: `Request failed (${res.status})` };
  try {
    return JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    return { error: `Unexpected response (${res.status})` };
  }
}

/**
 * A paid-for change that hasn't been applied yet, kept in localStorage.
 *
 * The fee is spent before the API records anything, so if that call fails the
 * user is out of pocket with nothing to show. Persisting the signature means
 * the change can be re-applied later — the server's redeem is atomic, so
 * retrying the same signature is always safe.
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

export function SkinPicker({ subject }: { subject: string }) {
  const { getSigner } = useWallet();
  const program = useProgram();
  const [skin, setSkin] = useState<string>(DEFAULT_SKIN_ID);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingSkin | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/verification/skin?subject=${subject}`);
        const json = await readJson(res);
        if (!cancelled) setSkin(json.skin ?? DEFAULT_SKIN_ID);
      } catch {
        if (!cancelled) setSkin(DEFAULT_SKIN_ID);
      } finally {
        if (!cancelled) {
          // Surface any fee already paid whose change never landed, so it can
          // be re-applied rather than quietly lost.
          setPending(readPending(subject));
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);

  /** Submit an already-paid signature. Safe to call repeatedly. */
  async function applyPaid(id: string, signature: string): Promise<void> {
    const res = await fetch("/api/verification/skin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, skin: id, signature }),
    });
    const json = await readJson(res);
    // 409 means this signature was already consumed — the change did land, so
    // treat it as success rather than stranding the user in a retry loop.
    if (res.status === 409) {
      setSkin(id);
      clearPending();
      return;
    }
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save skin");
    setSkin(id);
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

  async function choose(id: string) {
    if (id === skin || saving) return;
    if (!program) {
      setErr("Connect a wallet to change your skin.");
      return;
    }
    if (!getSigner()) {
      setErr("Wallet unavailable.");
      return;
    }
    setSaving(id);
    setErr(null);
    try {
      const global = await fetchGlobal(program);
      if (!global?.treasury) throw new Error("Couldn't read the protocol treasury.");

      // Pay first: the API only applies a skin against a confirmed transfer.
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

      await applyPaid(id, signature);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save skin");
    } finally {
      setSaving(null);
    }
  }

  /** Re-submit a payment whose skin never landed. */
  async function retryPending() {
    if (!pending || saving) return;
    setSaving(pending.skin);
    setErr(null);
    try {
      await applyPaid(pending.skin, pending.signature);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Still couldn't apply it — try again shortly.");
    } finally {
      setSaving(null);
    }
  }

  const active = skinById(skin);

  return (
    <div className="mt-5 border-t border-white/[0.08] pt-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[12px] font-bold">Badge skin</div>
        <div className="font-mono text-[10px] text-signal">{FEE_SOL} SOL per change</div>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B6B]">
        Changes the artwork only — the credential, its handle binding and what it gates are
        untouched. The fee goes to the protocol treasury; the skin itself is applied off-chain,
        so the NFT is never re-minted.
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
                {saving === s.id ? "PAYING…" : s.name}
              </span>
            </button>
          );
        })}
      </div>

      {pending && pending.skin !== skin && (
        <div className="mt-3 rounded-sm border border-signal/30 bg-signal/[0.06] p-3">
          <div className="font-mono text-[10px] leading-relaxed text-[#F5F4F0]">
            You already paid for <span className="text-signal">{skinById(pending.skin).name}</span>{" "}
            but it didn&apos;t apply — usually the database was briefly asleep. Your{" "}
            {FEE_SOL} SOL isn&apos;t lost; re-apply it for free.
          </div>
          <button
            onClick={() => void retryPending()}
            disabled={saving !== null}
            className="mt-2 rounded-sm bg-signal px-3 py-1.5 font-mono text-[10px] font-bold text-[#0A0A0A] disabled:opacity-40"
          >
            {saving ? "APPLYING…" : "RE-APPLY (NO CHARGE)"}
          </button>
        </div>
      )}

      {err && <p className="mt-2 font-mono text-[10px] leading-relaxed text-noise">{err}</p>}

      <p className="mt-2 font-mono text-[10px] text-[#4b5563]">
        Current: {active.name} · wallets and explorers refresh within a minute.
      </p>
    </div>
  );
}
