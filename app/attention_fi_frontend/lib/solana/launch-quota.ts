import { PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { launchPolicyPda, launchQuotaPda } from "./program";

/** Mirrors `DEFAULT_MAX_LAUNCHES` / `DEFAULT_WINDOW_SECS` in launch_quota.rs. */
const DEFAULT_MAX_LAUNCHES = 3;
const DEFAULT_WINDOW_SECS = 86_400;

export interface LaunchQuota {
  /** Launches inside the trailing window. */
  used: number;
  /** Launches allowed per window. */
  max: number;
  /** How many are left; 0 means the next launch is refused. */
  remaining: number;
  /** Seconds until a slot frees, or 0 when one is free now. */
  secondsUntilNext: number;
  /** Window length, so the UI can say what the allowance is per. */
  windowSecs: number;
}

/**
 * How many launches this wallet has left, and when the limit lifts.
 *
 * Deliberately a re-implementation of `launch_quota.rs` rather than a call
 * into it. The program is the authority on whether a launch is allowed; this
 * only predicts, so that the answer can be shown *before* signing instead of
 * arriving as `LaunchRateLimited` after. The two must agree, so both count the
 * same way: a stamp counts when it is non-zero and strictly inside the window,
 * and the wait is measured from the oldest stamp still inside it.
 *
 * Zeroed slots are skipped rather than treated as time 0 — the ring is
 * fixed-length and starts empty, so an unused slot is "no launch", not "a
 * launch at the epoch".
 */
export async function fetchLaunchQuota(
  program: Program<AttentionFi>,
  creator: PublicKey,
): Promise<LaunchQuota> {
  const [policy, quota] = await Promise.all([
    program.account.launchPolicy.fetchNullable(launchPolicyPda()).catch(() => null),
    program.account.launchQuota.fetchNullable(launchQuotaPda(creator)).catch(() => null),
  ]);

  // An absent policy is the ordinary state of a fresh deployment, not an
  // error: the program falls back to the same defaults, so the app must too or
  // it would advertise a limit nobody is enforcing.
  const max = policy ? policy.maxLaunches : DEFAULT_MAX_LAUNCHES;
  const windowSecs = policy ? Number(policy.windowSecs.toString()) : DEFAULT_WINDOW_SECS;

  const stamps: number[] = quota
    ? quota.stamps.map((s: { toString(): string }) => Number(s.toString()))
    : [];

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - windowSecs;
  const inWindow = stamps.filter((s) => s > 0 && s > cutoff);
  const used = inWindow.length;
  const remaining = Math.max(0, max - used);

  let secondsUntilNext = 0;
  if (remaining === 0 && inWindow.length > 0) {
    const oldest = Math.min(...inWindow);
    secondsUntilNext = Math.max(0, oldest + windowSecs - now);
  }

  return { used, max, remaining, secondsUntilNext, windowSecs };
}

/** "4h 12m" / "38m" / "45s" — the shortest phrasing that stays honest. */
export function formatWait(seconds: number): string {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/** "24 hours" / "1 hour" / "30 minutes", for describing the window itself. */
export function formatWindow(seconds: number): string {
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "hour" : `${h} hours`;
  }
  const m = Math.round(seconds / 60);
  return m === 1 ? "minute" : `${m} minutes`;
}
