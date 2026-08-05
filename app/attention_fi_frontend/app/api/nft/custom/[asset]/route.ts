/**
 * Metadata for a plain (non-perk, non-genesis) AttentionFi NFT.
 *
 * Perk and genesis assets have a program PDA to describe them; a standalone
 * mint has nothing but the mpl-core account itself. That's enough: the name
 * lives on-chain, so this route reads it from the asset rather than trusting
 * the URL, and renders the same card the app shows.
 *
 * This exists because artwork is optional at mint. It used to be optional in
 * the worst way — omit it and the asset's `uri` was written as an empty
 * string, which mpl-core fixes at mint time and only the update authority can
 * change. The asset was permanently blank in every wallet. Pointing at this
 * route instead keeps artwork optional without minting something broken.
 */
import { NextResponse } from "next/server";
import { readCoreAsset } from "@/lib/nft-metadata";

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const decoded = await readCoreAsset(asset).catch(() => null);
  if (!decoded) {
    // 404 rather than a placeholder, so a wallet can't be shown convincing
    // artwork for an asset that doesn't exist.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const image = `${origin}/api/nft/custom/${asset}/image`;

  return NextResponse.json(
    {
      name: decoded.name || "AttentionFi NFT",
      description: `A 1-of-1 minted on AttentionFi. Held by ${decoded.owner}.`,
      image,
      external_url: `${origin}/nft`,
      attributes: [{ trait_type: "Transferable", value: "Yes" }],
      properties: {
        category: "image",
        files: [{ uri: image, type: "image/svg+xml" }],
      },
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
