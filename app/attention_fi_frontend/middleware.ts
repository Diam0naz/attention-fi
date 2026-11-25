import { NextResponse, type NextRequest } from "next/server";
import { isGatedPath, V0_GATE } from "@/lib/v0-gate";
import { BLOCKED_PATH, isBlockedCountry } from "@/lib/geo-block";
import { isOutOfScopePath } from "@/lib/scope";

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
  // Jurisdiction first, and before the v0 gate: a blocked visitor should be
  // told they're blocked whichever deployment they land on, and the reason
  // doesn't depend on whether the app happens to be unlocked.
  //
  // Reuses `isGatedPath`, so the block covers exactly the app surfaces and
  // leaves the landing page, the feed and /api reachable — including the page
  // explaining the block, which a redirect loop would otherwise hide.
  const country =
    request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry");
  if (
    isBlockedCountry(country) &&
    isGatedPath(request.nextUrl.pathname) &&
    request.nextUrl.pathname !== BLOCKED_PATH
  ) {
    const url = request.nextUrl.clone();
    url.pathname = BLOCKED_PATH;
    url.search = "";
    url.hash = "";
    return NextResponse.redirect(url);
  }

  // Outside the current product scope (lib/scope.ts). A rewrite to a route that
  // doesn't exist renders the not-found page with a real 404 status; notFound()
  // in the segment's layout alone returned the page with a 200 for /nft.
  if (isOutOfScopePath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/__out-of-scope";
    return NextResponse.rewrite(url);
  }

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
