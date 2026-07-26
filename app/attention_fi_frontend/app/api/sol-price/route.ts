import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK_USD = 164.2;
const TTL_MS = 60_000;

let cached: { usd: number; at: number } | null = null;

/** SOL/USD spot for USD display labels. Cached ~60s; the program itself is
 *  lamports/SOL-native, so this is a display rate, not an on-chain oracle. */
export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ usd: cached.usd, cached: true });
  }
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`coinbase ${res.status}`);
    const json = (await res.json()) as { data?: { amount?: string } };
    const usd = Number(json.data?.amount);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error("bad price");
    cached = { usd, at: Date.now() };
    return NextResponse.json({ usd });
  } catch {
    // Serve the last good value if we have one, else the static fallback.
    return NextResponse.json({ usd: cached?.usd ?? FALLBACK_USD, stale: true });
  }
}
