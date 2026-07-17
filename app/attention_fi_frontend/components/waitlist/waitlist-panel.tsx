"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { X_HANDLE, X_URL } from "@/lib/config";
import {
  TASKS,
  type LeaderboardRow,
  type TaskId,
  type WaitlistStatus,
} from "@/lib/waitlist-tasks";

export function WaitlistPanel({
  status,
  onStatus,
}: {
  status: WaitlistStatus;
  onStatus: (s: WaitlistStatus) => void;
}) {
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [busy, setBusy] = useState<TaskId | null>(null);
  const [wallet, setWallet] = useState("");
  const [copied, setCopied] = useState(false);

  const referralUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${status.referralCode}`
      : "";

  // Reload the leaderboard whenever the user's points change. Cancels in-flight
  // work on unmount / re-run so a stale response can't clobber fresher state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/waitlist");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { leaderboard?: LeaderboardRow[] };
      if (!cancelled) setBoard(data.leaderboard ?? []);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status.points]);

  async function runTask(task: TaskId, extra?: { rating?: number; wallet?: string }) {
    setBusy(task);
    try {
      const res = await fetch("/api/waitlist/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: status.id, task, ...extra }),
      });
      if (res.ok) onStatus((await res.json()) as WaitlistStatus);
    } finally {
      setBusy(null);
    }
  }

  function onTaskClick(task: TaskId) {
    if (status.tasks.includes(task)) return;
    if (task === "follow_x") {
      window.open(X_URL, "_blank", "noopener");
      runTask(task);
    } else if (task === "share_x") {
      const text = `I'm trading attention on @${X_HANDLE} — join the waitlist:`;
      window.open(
        `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(referralUrl)}`,
        "_blank",
        "noopener",
      );
      runTask(task);
    } else if (task === "connect_wallet") {
      if (wallet.trim()) runTask(task, { wallet: wallet.trim() });
    }
  }

  function copyRef() {
    navigator.clipboard?.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      {/* rank + points */}
      <div className="flex items-end justify-between pr-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Your position
          </div>
          <div className="text-[34px] font-bold leading-none tracking-[-0.03em] text-signal">
            #{status.position}
            <span className="ml-1.5 text-[13px] font-normal text-[#6B6B6B]">
              / {status.total}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Points
          </div>
          <div className="font-mono text-[22px] font-bold">{status.points}</div>
        </div>
      </div>

      {/* referral link */}
      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          Your referral link · {status.referrals} joined
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-sm border border-white/10 bg-[#12181f] px-2.5 py-1.5">
          <span className="flex-1 truncate font-mono text-[11px] text-[#9aa4af]">
            {referralUrl.replace(/^https?:\/\//, "")}
          </span>
          <button
            onClick={copyRef}
            className="inline-flex items-center gap-1 rounded-sm bg-white/5 px-2 py-1 font-mono text-[10px] hover:bg-white/10"
          >
            {copied ? <Check className="h-3 w-3 text-signal" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* tasks */}
      <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
        Climb the list
      </div>
      <ul className="mt-2 space-y-1.5">
        {TASKS.map((t) => {
          const done = status.tasks.includes(t.id);
          return (
            <li
              key={t.id}
              className={cn(
                "flex items-center gap-3 rounded-sm border px-3 py-2",
                done ? "border-signal/30 bg-signal/[0.06]" : "border-white/[0.08]",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{t.label}</div>
                <div className="font-mono text-[10px] text-signal">+{t.points} pts</div>
              </div>

              {done ? (
                <Check className="h-4 w-4 shrink-0 text-signal" />
              ) : t.id === "rate_product" ? (
                <div className="flex shrink-0 gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      aria-label={`Rate ${n}`}
                      disabled={busy === t.id}
                      onClick={() => runTask("rate_product", { rating: n })}
                      className="text-[#475569] hover:text-signal"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              ) : t.id === "connect_wallet" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    placeholder="wallet"
                    className="w-24 rounded-sm border border-white/10 bg-[#12181f] px-2 py-1 font-mono text-[11px] outline-none focus:border-signal/50"
                  />
                  <button
                    disabled={busy === t.id || !wallet.trim()}
                    onClick={() => onTaskClick(t.id)}
                    className="rounded-sm bg-white/5 px-2 py-1 font-mono text-[10px] hover:bg-white/10 disabled:opacity-40"
                  >
                    {t.cta}
                  </button>
                </div>
              ) : (
                <button
                  disabled={busy === t.id}
                  onClick={() => onTaskClick(t.id)}
                  className="shrink-0 rounded-sm bg-white/5 px-2.5 py-1 font-mono text-[10px] hover:bg-white/10 disabled:opacity-40"
                >
                  {t.cta}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* leaderboard */}
      {board.length > 0 && (
        <>
          <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Leaderboard
          </div>
          <ul className="mt-2 overflow-hidden rounded-sm border border-white/[0.08]">
            {board.map((row) => (
              <li
                key={row.rank}
                className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-1.5 text-[12px] last:border-b-0"
              >
                <span className="w-6 font-mono text-[11px] text-[#6B6B6B]">
                  {String(row.rank).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate font-mono text-[11px]">{row.name}</span>
                <span className="font-mono text-[11px] text-signal">{row.points}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
