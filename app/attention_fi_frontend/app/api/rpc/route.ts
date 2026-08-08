import { NextResponse, type NextRequest } from "next/server";
import { SERVER_RPC_ENDPOINT } from "@/lib/solana/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * JSON-RPC proxy to a keyed Solana endpoint.
 *
 * The app reads a lot of chain state per screen — the profile alone runs
 * several `getProgramAccounts` scans across holdings, notifications and the NFT
 * grid — and the public devnet endpoint rate-limits well below that. The
 * symptom isn't an error message: hooks catch, degrade to empty, and the page
 * quietly reports that a wallet holds nothing. Which is the worst way to be
 * wrong, and exactly what "my NFTs aren't loading" was.
 *
 * A proxy rather than putting the keyed URL in NEXT_PUBLIC_: that would ship
 * the key to every visitor, where anyone can lift it and spend the quota. Here
 * the browser talks to its own origin and the key never leaves the server.
 *
 * Deliberately thin. It forwards the body and returns the response verbatim,
 * so web3.js sees exactly what it would see talking to the endpoint directly —
 * no reinterpretation of errors, no partial parsing, nothing to drift.
 */
export async function POST(req: NextRequest) {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(SERVER_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // A long scan can legitimately take a while; anything past this is
      // failing rather than slow, and the caller polls.
      signal: AbortSignal.timeout(25_000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // Shaped as JSON-RPC so web3.js reports something intelligible rather than
    // choking on an HTML error page.
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: e instanceof Error ? e.message : "upstream failed" },
      },
      { status: 502 },
    );
  }
}
