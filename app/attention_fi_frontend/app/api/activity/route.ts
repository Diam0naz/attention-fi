import { NextResponse, type NextRequest } from "next/server";
import { crawlIfStale } from "@/lib/indexer";
import { getActivity, indexerDbConfigured, type ActivityRow } from "@/lib/indexer-db";
import { allTokens, tokenByHandle, tokenDbConfigured } from "@/lib/token-db";

export const dynamic = "force-dynamic";

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 6; // mirrors Global.token_decimals

const normHandle = (h: string) => h.replace(/^@/, "").toLowerCase();

interface TokenMeta {
  handle: string;
  symbol: string | null;
  name: string | null;
}

/** JSON-safe activity record: bigints → strings, lamports/base units → decimals. */
function serialize(r: ActivityRow, token: TokenMeta | null) {
  return {
    signature: r.signature,
    kind: r.kind,
    mint: r.mint,
    actor: r.actor,
    isBuy: r.isBuy,
    sol: r.solLamports === null ? null : Number(r.solLamports) / LAMPORTS_PER_SOL,
    solLamports: r.solLamports === null ? null : r.solLamports.toString(),
    tokens: r.tokenAmount === null ? null : Number(r.tokenAmount) / 10 ** TOKEN_DECIMALS,
    tokenAmount: r.tokenAmount === null ? null : r.tokenAmount.toString(),
    fee: r.feeLamports === null ? null : Number(r.feeLamports) / LAMPORTS_PER_SOL,
    slot: r.slot,
    blockTime: r.blockTime,
    token,
  };
}

/**
 * Recent on-chain activity (launches, trades, graduations, swaps, claims),
 * newest-first. Filter by `?mint=`, `?handle=`, `?actor=`, or `?kinds=trade,launch`.
 * Each row is enriched with the token's handle/symbol/name from the registry.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mintParam = p.get("mint") ?? undefined;
  const handleParam = p.get("handle");
  const actor = p.get("actor") ?? undefined;
  const kinds = (p.get("kinds") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const limit = Number(p.get("limit")) || 50;

  if (!indexerDbConfigured()) {
    return NextResponse.json({ events: [], count: 0, reason: "no-db" });
  }

  // Resolve a handle filter to its mint, and build a mint→meta map for enrichment.
  const meta = new Map<string, TokenMeta>();
  let mint = mintParam;
  if (tokenDbConfigured()) {
    try {
      for (const t of await allTokens()) {
        meta.set(t.mint, { handle: t.handle, symbol: t.symbol, name: t.name });
      }
    } catch {
      // registry unreachable — activity still returns, just without token names
    }
    if (handleParam && !mint) {
      const t = await tokenByHandle(normHandle(handleParam)).catch(() => null);
      if (t) mint = t.mint;
    }
  }

  await crawlIfStale();

  const rows = await getActivity({
    mint,
    actor,
    kinds: kinds.length > 0 ? kinds : undefined,
    limit,
  });
  const events = rows.map((r) => serialize(r, r.mint ? (meta.get(r.mint) ?? null) : null));
  return NextResponse.json({ events, count: events.length });
}
