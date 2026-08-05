import { NextResponse, type NextRequest } from "next/server";
import { isGatedPath, V0_GATE } from "@/lib/v0-gate";

/**
 * v0 gate — redirects v1 app surfaces back to the landing page.
 *
 * First visitors should learn the thesis, mechanism design, and verticals
 * before the full app is unlocked. Enabled per deployment via
 * NEXT_PUBLIC_V0_GATE, not per branch: main and v1 hold the same code now, so
 * a branch-keyed gate would lock the app everywhere including the deployment
 * used to test it.
 *
 * The matcher deliberately excludes /api. The gate is about what a visitor is
 * shown, not about what the app can serve — NFT metadata and skin routes are
 * fetched by wallets and explorers that have no session and no interest in the
 * landing page, and an asset's `uri` points at them permanently.
 */
export function middleware(request: NextRequest) {
  if (!V0_GATE) return NextResponse.next();

  if (isGatedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.hash = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Only run on page routes (skip API, _next, static assets)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
