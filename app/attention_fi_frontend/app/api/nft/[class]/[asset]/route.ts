/**
 * Metaplex-standard metadata for a perk or genesis NFT.
 *
 * The asset's on-chain `uri` points here, so wallets and explorers resolve the
 * artwork at read time — restyling is a row update rather than a transaction,
 * with no update authority and no redeploy. The trade-off, as with the
 * verification badge, is that the art is only as available as this endpoint.
 *
 * Traits are read from the on-chain PDA rather than taken from the URL, so
 * metadata can't be spoofed by requesting an asset with chosen attributes.
 */
import { NextResponse } from "next/server";
import { getAssetSkin } from "@/lib/skin-db";
import { isSkinClass, paletteFor, readNftFacts } from "@/lib/nft-metadata";

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ class: string; asset: string }> },
) {
  const { class: cls, asset } = await params;
  if (!isSkinClass(cls)) {
    return NextResponse.json({ error: "unknown class" }, { status: 404 });
  }

  const facts = await readNftFacts(cls, asset);
  if (!facts) {
    // No PDA — nothing to describe. 404 rather than a placeholder, so a wallet
    // can't render convincing-looking artwork for an NFT that doesn't exist.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const skin = paletteFor(facts, await getAssetSkin(cls, asset).catch(() => null));
  const origin = new URL(request.url).origin;
  const image = `${origin}/api/nft/${cls}/${asset}/image`;

  const isPerk = cls === "perk";
  const name = isPerk
    ? `AttentionFi Perk · Level ${facts.level}`
    : `AttentionFi Genesis · ${((facts.shareBps ?? 0) / 100).toFixed(2)}%`;

  return NextResponse.json(
    {
      name,
      description: isPerk
        ? `A soulbound AttentionFi perk granting ${((facts.discountBps ?? 0) / 100).toFixed(0)}% off every trade. Bound to ${facts.owner}.`
        : `A transferable AttentionFi genesis NFT earning ${((facts.shareBps ?? 0) / 100).toFixed(2)}% of its token's fee stream.`,
      image,
      external_url: `${origin}/nft/${isPerk ? "perk" : "genesis"}`,
      attributes: isPerk
        ? [
            { trait_type: "Level", value: facts.level },
            { trait_type: "Fee discount", value: `${((facts.discountBps ?? 0) / 100).toFixed(0)}%` },
            { trait_type: "Transferable", value: "No" },
            { trait_type: "Skin", value: skin.name },
          ]
        : [
            { trait_type: "Fee share", value: `${((facts.shareBps ?? 0) / 100).toFixed(2)}%` },
            { trait_type: "Transferable", value: "Yes" },
            { trait_type: "Skin", value: skin.name },
          ],
      properties: {
        category: "image",
        files: [{ uri: image, type: "image/svg+xml" }],
      },
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
