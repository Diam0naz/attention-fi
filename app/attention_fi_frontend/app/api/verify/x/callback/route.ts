import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCode,
  fetchHandle,
  OAUTH_COOKIE,
  PROOF_COOKIE,
  readOAuthState,
  signProof,
  xConfig,
} from "@/lib/x-oauth";

export const dynamic = "force-dynamic";

/** Where the user lands after X, with a status flag the launch flow reads. */
function back(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/launch", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** X redirects here with ?code&state. Exchange, read the handle, issue proof. */
export async function GET(req: NextRequest) {
  const cfg = xConfig();
  if (!cfg) return back(req, { x_error: "notconfigured" });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookie = req.cookies.get(OAUTH_COOKIE)?.value;
  const saved = cookie ? readOAuthState(cfg, cookie) : null;

  // If the user denied consent X sends ?error=access_denied instead of a code.
  if (req.nextUrl.searchParams.get("error")) return back(req, { x_error: "denied" });
  if (!code || !state || !saved || saved.state !== state) {
    return back(req, { x_error: "state" });
  }

  try {
    const accessToken = await exchangeCode(cfg, code, saved.verifier);
    const handle = await fetchHandle(accessToken);

    const res = back(req, { x: handle });
    res.cookies.set(PROOF_COOKIE, signProof(cfg, { wallet: saved.wallet, handle }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (e) {
    console.error("[/api/verify/x/callback] failed:", e);
    return back(req, { x_error: "exchange" });
  }
}
