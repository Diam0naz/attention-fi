// File-based waitlist store — zero-dependency and works offline. Swap the
// read/write pair for a real DB (Postgres/Redis) in production; the exported
// functions are the interface the API depends on.

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  BASE_POINTS,
  REFERRAL_POINTS,
  taskPoints,
  type LeaderboardRow,
  type TaskId,
  type WaitlistStatus,
} from "./waitlist-tasks";

interface Signup {
  id: string;
  email?: string;
  wallet?: string;
  points: number;
  referralCode: string;
  referredBy?: string;
  referrals: number;
  tasks: TaskId[];
  rating: number | null;
  createdAt: string;
}

const FILE = path.join(process.cwd(), ".data", "waitlist.json");

async function readAll(): Promise<Signup[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Signup[];
  } catch {
    return [];
  }
}

async function writeAll(list: Signup[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2));
}

// Serialize mutations so concurrent requests can't clobber the file.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

/** Sort by points desc, then earliest signup — the leaderboard ordering. */
function ranked(list: Signup[]): Signup[] {
  return [...list].sort(
    (a, b) => b.points - a.points || a.createdAt.localeCompare(b.createdAt),
  );
}

function statusOf(list: Signup[], signup: Signup): WaitlistStatus {
  const position = ranked(list).findIndex((s) => s.id === signup.id) + 1;
  return {
    id: signup.id,
    points: signup.points,
    position,
    total: list.length,
    referralCode: signup.referralCode,
    referrals: signup.referrals,
    tasks: signup.tasks,
    rating: signup.rating,
  };
}

function maskName(s: Signup): string {
  if (s.wallet) return `${s.wallet.slice(0, 4)}…${s.wallet.slice(-4)}`;
  if (s.email) {
    const [user = "", domain = ""] = s.email.split("@");
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return "anon";
}

function newReferralCode(): string {
  return randomUUID().replace(/-/g, "").slice(0, 7);
}

export async function getLeaderboard(limit = 10): Promise<{
  count: number;
  leaderboard: LeaderboardRow[];
}> {
  const list = await readAll();
  const leaderboard = ranked(list)
    .slice(0, limit)
    .map((s, i) => ({
      rank: i + 1,
      name: maskName(s),
      points: s.points,
      referrals: s.referrals,
    }));
  return { count: list.length, leaderboard };
}

export async function getStatus(id: string): Promise<WaitlistStatus | null> {
  const list = await readAll();
  const signup = list.find((s) => s.id === id);
  return signup ? statusOf(list, signup) : null;
}

export function addSignup(input: {
  email?: string;
  wallet?: string;
  ref?: string;
}): Promise<{ status: WaitlistStatus; duplicate: boolean }> {
  return withLock(async () => {
    const list = await readAll();

    const existing = list.find(
      (s) =>
        (input.email && s.email === input.email) ||
        (input.wallet && s.wallet === input.wallet),
    );
    if (existing) return { status: statusOf(list, existing), duplicate: true };

    const signup: Signup = {
      id: randomUUID(),
      email: input.email,
      wallet: input.wallet,
      points: BASE_POINTS,
      referralCode: newReferralCode(),
      referrals: 0,
      tasks: [],
      rating: null,
      createdAt: new Date().toISOString(),
    };

    // Credit the referrer (if the code matches and it isn't a self-referral).
    if (input.ref) {
      const referrer = list.find((s) => s.referralCode === input.ref);
      if (referrer) {
        referrer.points += REFERRAL_POINTS;
        referrer.referrals += 1;
        signup.referredBy = referrer.id;
      }
    }

    list.push(signup);
    await writeAll(list);
    return { status: statusOf(list, signup), duplicate: false };
  });
}

export function completeTask(
  id: string,
  task: TaskId,
  meta: { rating?: number; wallet?: string },
): Promise<WaitlistStatus | null> {
  return withLock(async () => {
    const list = await readAll();
    const signup = list.find((s) => s.id === id);
    if (!signup) return null;

    // Award once per task.
    if (!signup.tasks.includes(task)) {
      signup.tasks.push(task);
      signup.points += taskPoints(task);
    }
    if (task === "rate_product" && typeof meta.rating === "number") {
      signup.rating = Math.max(1, Math.min(5, Math.round(meta.rating)));
    }
    if (task === "connect_wallet" && meta.wallet) {
      signup.wallet = meta.wallet;
    }

    await writeAll(list);
    return statusOf(list, signup);
  });
}
