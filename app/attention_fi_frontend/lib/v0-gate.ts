/**
 * Whether this deployment serves the v0 public site or the full v1 app.
 *
 * Once v1 merged into main the two branches hold identical code, so "which
 * branch is deployed" stopped being able to answer this — a gate keyed on the
 * branch would have locked the app on every deployment, including the one
 * used to test it. Config decides instead: set NEXT_PUBLIC_V0_GATE=1 on the
 * public deployment, leave it unset everywhere else.
 *
 * Read through a NEXT_PUBLIC_ variable because both the proxy and the client
 * components need the same answer, and they have to agree — nav that offers a
 * link the proxy will bounce is worse than either behaviour on its own.
 */
export const V0_GATE = process.env.NEXT_PUBLIC_V0_GATE === "1";

/**
 * App surfaces the gate hides. Kept here rather than in the proxy so the nav
 * and footer hide exactly what the proxy redirects — one list, one truth.
 */
export const V1_PREFIXES = [
  "/discover",
  "/launch",
  "/nft",
  "/profile",
  "/terminal",
  "/token",
] as const;

/** True when `pathname` is a gated app surface. */
export function isGatedPath(pathname: string): boolean {
  return V1_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
