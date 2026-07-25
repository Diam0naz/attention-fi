import { NextResponse, type NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  allTokens,
  registerToken,
  tokenByHandle,
  tokenDbConfigured,
  tokensByCreator,
} from "@/lib/token-db";

export const dynamic = "force-dynamic";

const norm = (h: string) => h.replace(/^@/, "").toLowerCase();
const isPubkey = (s: string) => {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};

/** Read: ?creator=<wallet> | ?handle=<handle> | (none → all launched tokens). */
export async function GET(req: NextRequest) {
  if (!tokenDbConfigured()) return NextResponse.json({ tokens: [] });
  const creator = req.nextUrl.searchParams.get("creator");
  const handle = req.nextUrl.searchParams.get("handle");
  try {
    if (handle) {
      const token = await tokenByHandle(norm(handle));
      return NextResponse.json({ token });
    }
    if (creator) {
      if (!isPubkey(creator)) return NextResponse.json({ error: "invalid creator" }, { status: 400 });
      return NextResponse.json({ tokens: await tokensByCreator(creator) });
    }
    return NextResponse.json({ tokens: await allTokens() });
  } catch (e) {
    console.error("[/api/tokens] read failed:", e);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
}

/** Record a launch: { handle, mint, creator, name?, symbol?, image?, mechanism? }. */
export async function POST(req: NextRequest) {
  if (!tokenDbConfigured()) return NextResponse.json({ ok: false, reason: "db-not-configured" });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const handle = typeof b.handle === "string" ? norm(b.handle) : "";
  const mint = typeof b.mint === "string" ? b.mint : "";
  const creator = typeof b.creator === "string" ? b.creator : "";
  if (!handle || handle.length > 15) return NextResponse.json({ error: "invalid handle" }, { status: 400 });
  if (!isPubkey(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  if (!isPubkey(creator)) return NextResponse.json({ error: "invalid creator" }, { status: 400 });

  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max ? v : null;
  try {
    await registerToken({
      handle,
      mint,
      creator,
      name: str(b.name, 64),
      symbol: str(b.symbol, 12),
      image: str(b.image, 500_000),
      mechanism: str(b.mechanism, 16),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/tokens] write failed:", e);
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
