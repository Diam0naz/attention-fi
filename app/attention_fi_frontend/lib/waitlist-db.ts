// Postgres (Neon serverless) waitlist store — used on Vercel and any host where
// DATABASE_URL / POSTGRES_URL is set. Same interface as waitlist-fs.ts.

import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

import {
  BASE_POINTS,
  REFERRAL_POINTS,
  taskPoints,
  type LeaderboardRow,
  type TaskId,
  type WaitlistStatus,
} from "./waitlist-tasks";

// Lazily initialise the Neon client so importing this module never calls neon()
// unless a query actually runs (i.e. only when a DB URL is configured).
let client: ReturnType<typeof neon> | null = null;
function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("waitlist-db: DATABASE_URL / POSTGRES_URL not set");
    client = neon(url);
  }
  return client(strings, ...values);
}

interface Row {
  id: string;
  email: string | null;
  wallet: string | null;
  points: number;
  referral_code: string;
  referrals: number;
  tasks: TaskId[];
  rating: number | null;
  created_at: string;
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists waitlist_signups (
          id text primary key,
          email text unique,
          wallet text unique,
          points integer not null default 100,
          referral_code text unique not null,
          referred_by text,
          referrals integer not null default 0,
          tasks text[] not null default '{}',
          rating integer,
          created_at timestamptz not null default now()
        )`;
      await sql`
        create index if not exists waitlist_rank_idx
        on waitlist_signups (points desc, created_at asc)`;
    })().catch((e) => {
      schemaReady = null; // allow a retry on a transient failure
      throw e;
    });
  }
  return schemaReady;
}

function maskName(email: string | null, wallet: string | null): string {
  if (wallet) return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  if (email) {
    const [user = "", domain = ""] = email.split("@");
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return "anon";
}

async function total(): Promise<number> {
  const [r] = (await sql`select count(*)::int as n from waitlist_signups`) as { n: number }[];
  return r?.n ?? 0;
}

async function positionOf(points: number, createdAt: string): Promise<number> {
  const [r] = (await sql`
    select count(*)::int + 1 as pos from waitlist_signups
    where points > ${points} or (points = ${points} and created_at < ${createdAt})`) as {
    pos: number;
  }[];
  return r?.pos ?? 1;
}

async function statusOf(row: Row): Promise<WaitlistStatus> {
  const [position, count] = await Promise.all([
    positionOf(row.points, row.created_at),
    total(),
  ]);
  return {
    id: row.id,
    points: row.points,
    position,
    total: count,
    referralCode: row.referral_code,
    referrals: row.referrals,
    tasks: row.tasks ?? [],
    rating: row.rating,
  };
}

export async function getLeaderboard(limit = 10): Promise<{
  count: number;
  leaderboard: LeaderboardRow[];
}> {
  await ensureSchema();
  const rows = (await sql`
    select id, email, wallet, points, referrals from waitlist_signups
    order by points desc, created_at asc limit ${limit}`) as Row[];
  return {
    count: await total(),
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      name: maskName(r.email, r.wallet),
      points: r.points,
      referrals: r.referrals,
    })),
  };
}

export async function getStatus(id: string): Promise<WaitlistStatus | null> {
  await ensureSchema();
  const [row] = (await sql`select * from waitlist_signups where id = ${id}`) as Row[];
  return row ? statusOf(row) : null;
}

export async function addSignup(input: {
  email?: string;
  wallet?: string;
  ref?: string;
}): Promise<{ status: WaitlistStatus; duplicate: boolean }> {
  await ensureSchema();

  // Dedupe on email or wallet.
  let existing: Row[] = [];
  if (input.email) {
    existing = (await sql`select * from waitlist_signups where email = ${input.email}`) as Row[];
  }
  if (!existing.length && input.wallet) {
    existing = (await sql`select * from waitlist_signups where wallet = ${input.wallet}`) as Row[];
  }
  if (existing[0]) return { status: await statusOf(existing[0]), duplicate: true };

  // Resolve the referrer (if any) before inserting.
  let referredBy: string | null = null;
  if (input.ref) {
    const [ref] = (await sql`
      select id from waitlist_signups where referral_code = ${input.ref}`) as { id: string }[];
    referredBy = ref?.id ?? null;
  }

  const [row] = (await sql`
    insert into waitlist_signups (id, email, wallet, points, referral_code, referred_by)
    values (${randomUUID()}, ${input.email ?? null}, ${input.wallet ?? null},
            ${BASE_POINTS}, ${randomUUID().replace(/-/g, "").slice(0, 7)}, ${referredBy})
    returning *`) as Row[];

  if (referredBy) {
    await sql`
      update waitlist_signups set points = points + ${REFERRAL_POINTS}, referrals = referrals + 1
      where id = ${referredBy}`;
  }

  return { status: await statusOf(row!), duplicate: false };
}

export async function completeTask(
  id: string,
  task: TaskId,
  meta: { rating?: number; wallet?: string },
): Promise<WaitlistStatus | null> {
  await ensureSchema();

  const [exists] = (await sql`select id from waitlist_signups where id = ${id}`) as { id: string }[];
  if (!exists) return null;

  // Award once — the `not (task = any(tasks))` guard makes it idempotent.
  await sql`
    update waitlist_signups
    set points = points + ${taskPoints(task)}, tasks = array_append(tasks, ${task})
    where id = ${id} and not (${task} = any(tasks))`;

  if (task === "rate_product" && typeof meta.rating === "number") {
    const rating = Math.max(1, Math.min(5, Math.round(meta.rating)));
    await sql`update waitlist_signups set rating = ${rating} where id = ${id}`;
  }
  if (task === "connect_wallet" && meta.wallet) {
    // Ignore if the wallet is already taken by someone else (unique constraint).
    try {
      await sql`update waitlist_signups set wallet = ${meta.wallet} where id = ${id}`;
    } catch {
      /* wallet already claimed — leave as-is */
    }
  }

  return getStatus(id);
}
