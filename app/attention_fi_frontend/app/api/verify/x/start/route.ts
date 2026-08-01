import { NextResponse, type NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  buildAuthUrl,
  makePkce,
  OAUTH_COOKIE,
  randomState,
  signOAuthState,
  xConfig,
} from "@/lib/x-oauth";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Begin the X OAuth flow: stash PKCE + wallet in a signed cookie, redirect to X. */
export async function GET(req: NextRequest) {
  // Each start burns an X API handshake against a quota that is not ours to
  // refill, so a loop here degrades verification for everyone.
  const limited = await rateLimit("verify:start", clientKey(req));
  if (!limited.ok) return tooManyRequests(limited);

  const cfg = xConfig();
  if (!cfg) {
    return NextResponse.json({ error: "X OAuth is not configured on this server." }, { status: 503 });
  }

  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
  }

  const { verifier, challenge } = makePkce();
  const state = randomState();
  const res = NextResponse.redirect(buildAuthUrl(cfg, state, challenge));
  res.cookies.set(OAUTH_COOKIE, signOAuthState(cfg, { wallet, state, verifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
