import { NextResponse, type NextRequest } from "next/server";
import { crawlIfStale } from "@/lib/indexer";
import { getActivity, indexerDbConfigured, type ActivityRow } from "@/lib/indexer-db";
import { allTokens, tokenByHandle, tokenDbConfigured } from "@/lib/token-db";
import { staticRegistry } from "@/lib/solana/static-registry";

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

  // Configured tokens as well as launched ones. The registry holds tokens
  // created through the app; the static seeds hold tokens set up outside it,
  // and a feed that only knows the former labels the latter with a truncated
  // mint — while ?handle= for it silently matches nothing and returns an empty
  // feed for a token that has traded plenty. Added second so a real launch
  // record always wins; the seeds carry a handle and nothing else.
  for (const [handle, address] of Object.entries(staticRegistry())) {
    if (!meta.has(address)) {
      meta.set(address, { handle, symbol: null, name: null });
    }
  }
  if (handleParam && !mint) {
    const seeded = Object.entries(staticRegistry()).find(
      ([h]) => h === normHandle(handleParam),
    );
    if (seeded) mint = seeded[1];
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
