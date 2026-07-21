import { NextResponse, type NextRequest } from "next/server";

/**
 * v0 gate — redirects all v1 app surfaces back to the landing page.
 *
 * First visitors should learn the thesis, mechanism design, and verticals
 * before the full app is unlocked. The route code stays in the tree so
 * the v1 branch can flip this off cleanly.
 */

const V1_PREFIXES = [
  "/discover",
  "/launch",
  "/nft",
  "/profile",
  "/terminal",
  "/token",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isGated = V1_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isGated) {
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
