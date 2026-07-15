"use client";

import { useState } from "react";
import type { WaitlistStatus } from "@/lib/waitlist-tasks";

export function WaitlistForm({ onJoined }: { onJoined: (s: WaitlistStatus) => void }) {
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ref =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref")
          : null;
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          wallet: wallet || undefined,
          ref: ref || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong");
        return;
      }
      onJoined(data as WaitlistStatus);
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2 className="pr-8 text-[20px] font-bold tracking-[-0.02em]">
        Trade attention before it&apos;s tradeable.
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#9aa4af]">
        Join the waitlist, then climb the leaderboard — refer friends and complete
        tasks to move up the line.
      </p>

      <label className="mt-5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@domain.com"
        className="mt-1.5 w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2 text-[13px] outline-none focus:border-signal/50"
      />

      <label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
        Solana wallet <span className="text-[#475569]">(optional)</span>
      </label>
      <input
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        placeholder="Base58 address"
        className="mt-1.5 w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2 font-mono text-[12px] outline-none focus:border-signal/50"
      />

      {error && <p className="mt-3 text-[12px] text-noise">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-sm bg-signal py-2.5 font-mono text-[12px] font-bold tracking-wide text-[#0A0A0A] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Joining…" : "Join Waitlist →"}
      </button>
    </form>
  );
}
