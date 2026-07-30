/**
 * Is the skins database configured and reachable, from the deployment's own
 * point of view?
 *
 * Exists because there was no way to tell "DATABASE_URL isn't set" from "you
 * have no skin": the skins GET returns the same empty answer either way, and
 * only the POST path — which needs a signature — distinguishes them. That made
 * a misconfigured deployment silently indistinguishable from a working one.
 *
 * Reports booleans and a latency figure, never the connection string, its host,
 * or any row. Safe to curl against a live deployment.
 */
import { NextResponse } from "next/server";
import { getOwnedSkins, isConnectionError, skinDbConfigured } from "@/lib/skin-db";

export const dynamic = "force-dynamic";

/** A syntactically valid address that will never own anything. */
const PROBE = "11111111111111111111111111111111";

export async function GET() {
  const configured = skinDbConfigured();
  if (!configured) {
    return NextResponse.json(
      {
        configured: false,
        reachable: false,
        detail: "DATABASE_URL / POSTGRES_URL is not set on this deployment.",
      },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    // A real query, so this also proves the schema migration can run — not
    // just that a string is present in the environment.
    await getOwnedSkins(PROBE);
    return NextResponse.json({
      configured: true,
      reachable: true,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    const waking = isConnectionError(e);
    return NextResponse.json(
      {
        configured: true,
        reachable: false,
        latencyMs: Date.now() - started,
        detail: waking
          ? "Configured, but the database didn't answer — it may be resuming. Retry shortly."
          : "Configured, but the query failed.",
      },
      { status: 503 },
    );
  }
}
