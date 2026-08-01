import { NextResponse, type NextRequest } from "next/server";
import { addSignup, getLeaderboard, getStatus } from "@/lib/waitlist-store";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** GET /api/waitlist            -> { count, leaderboard }
 *  GET /api/waitlist?id=<uuid>  -> the caller's status */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const status = await getStatus(id);
    if (!status) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(status);
  }
  return NextResponse.json(await getLeaderboard(10));
}

/** POST /api/waitlist { email?, wallet?, ref? } -> status (+ duplicate flag) */
export async function POST(req: NextRequest) {
  // The only unauthenticated write in the app, so the only one where a single
  // client can create unbounded rows without spending anything.
  const limited = await rateLimit("waitlist", clientKey(req));
  if (!limited.ok) return tooManyRequests(limited);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { email, wallet, ref } = (body ?? {}) as {
    email?: unknown;
    wallet?: unknown;
    ref?: unknown;
  };

  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined;
  const cleanWallet = typeof wallet === "string" ? wallet.trim() : undefined;
  const cleanRef = typeof ref === "string" && ref.trim() ? ref.trim() : undefined;

  if (!cleanEmail && !cleanWallet) {
    return NextResponse.json({ error: "email or wallet required" }, { status: 400 });
  }
  if (cleanEmail && !EMAIL.test(cleanEmail)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  if (cleanWallet && !WALLET.test(cleanWallet)) {
    return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
  }

  const { status, duplicate } = await addSignup({
    email: cleanEmail,
    wallet: cleanWallet,
    ref: cleanRef,
  });
  return NextResponse.json({ ...status, duplicate });
}
