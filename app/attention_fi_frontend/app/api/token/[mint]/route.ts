/**
 * Metaplex-standard metadata for a launched token.
 *
 * Every launch writes this route's URL into the mint's on-chain `uri`, so a
 * wallet or explorer that has never heard of AttentionFi still resolves a name,
 * a ticker and a picture instead of showing a bare address.
 *
 * Resolved at read time rather than pinned to a file, for a reason specific to
 * this program: launch metadata is written `is_mutable = false`, so the `uri`
 * can never be changed afterwards. A static document would be frozen at launch
 * with no way to correct it; an endpoint keeps the one permanent thing — the
 * URL — short and stable while what it returns can still be fixed.
 *
 * The trade-off is the same one the NFT routes take: the art is only as
 * available as this endpoint.
 */
import { NextResponse } from "next/server";
import { MECHANISM_LABEL, readTokenFacts, RpcUnavailable } from "@/lib/token-facts";

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;

  let facts;
  try {
    facts = await readTokenFacts(mint);
  } catch (e) {
    if (!(e instanceof RpcUnavailable)) throw e;
    // Explicitly uncached, and not a 404: the token may well exist and we
    // simply couldn't look. A cached "not found" would outlive the outage.
    return NextResponse.json(
      { error: "upstream unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!facts) {
    // 404 rather than a placeholder: a wallet shouldn't render a plausible
    // name for a mint this program never launched.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const image = `${origin}/api/token/${facts.mint}/image`;
  const subject = facts.handle ? `@${facts.handle}` : null;

  return NextResponse.json(
    {
      // Mirrors the on-chain record, because a wallet shows whichever it reads
      // first and two different names for one token reads as a counterfeit.
      name: facts.name,
      symbol: facts.symbol,
      description: subject
        ? `${facts.symbol} trades the attention of ${subject} on AttentionFi.`
        : `${facts.symbol} is an AttentionFi attention market.`,
      image,
      external_url: subject ? `${origin}/token/${facts.handle}` : origin,
      attributes: [
        { trait_type: "Mechanism", value: MECHANISM_LABEL[facts.mechanism] },
        ...(subject ? [{ trait_type: "Subject", value: subject }] : []),
        { trait_type: "Creator", value: facts.creator },
      ],
      properties: {
        category: "image",
        files: [{ uri: image }],
        creators: [{ address: facts.creator, share: 100 }],
      },
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
