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
import { getAssetSkinWithUri } from "@/lib/skin-db";
import { isSkinClass, paletteFor, readNftFacts } from "@/lib/nft-metadata";
import { resolveSubject } from "@/lib/nft-subject";
import { CUSTOM_SKIN, CUSTOM_SKIN_ID } from "@/lib/nft-skins";

/** Signature carries artwork rather than a palette, so paletteFor can't name it. */
const isCustomName = (id: string | null) => id === CUSTOM_SKIN_ID;

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

  const sel = await getAssetSkinWithUri(cls, asset).catch(() => ({
    skin: null,
    customUri: null,
  }));
  const skin = paletteFor(facts, sel.skin);
  const skinName = isCustomName(sel.skin) ? CUSTOM_SKIN.name : skin.name;
  const origin = new URL(request.url).origin;

  // Signature swaps the generated card for the holder's artwork; every other
  // skin renders through the SVG route. Validated https on the way in, and
  // never fetched server-side.
  const isCustom = sel.skin === CUSTOM_SKIN_ID && Boolean(sel.customUri);
  const image = isCustom ? sel.customUri! : `${origin}/api/nft/${cls}/${asset}/image`;

  const isPerk = cls === "perk";
  // Which token's fees, resolved server-side. A genesis NFT's whole meaning is
  // "a share of *this* token", and the metadata previously said only "its
  // token's fee stream" — true, and useless to anyone deciding what it's worth.
  // `name` is the resolved token; `label` degrades to the shortened mint for
  // prose. The Subject *trait* uses only the former — a truncated address
  // there would restate the full "Subject mint" attribute below it, worse than
  // omitting it.
  const { name: subject, label: subjectLabel } = isPerk
    ? { name: null, label: null }
    : await resolveSubject(facts.subjectMint);
  const name = isPerk
    ? `AttentionFi Perk · Level ${facts.level}`
    : `AttentionFi Genesis · ${((facts.shareBps ?? 0) / 100).toFixed(2)}%${subjectLabel ? ` of ${subjectLabel}` : ""}`;

  return NextResponse.json(
    {
      name,
      description: isPerk
        ? `A soulbound AttentionFi perk granting ${((facts.discountBps ?? 0) / 100).toFixed(0)}% off every trade. Bound to ${facts.owner}.`
        : `A transferable AttentionFi genesis NFT earning ${((facts.shareBps ?? 0) / 100).toFixed(2)}% of ${subjectLabel ?? "its token"}'s fee stream.`,
      image,
      external_url: `${origin}/nft/${isPerk ? "perk" : "genesis"}`,
      attributes: isPerk
        ? [
            { trait_type: "Level", value: facts.level },
            { trait_type: "Fee discount", value: `${((facts.discountBps ?? 0) / 100).toFixed(0)}%` },
            { trait_type: "Transferable", value: "No" },
            { trait_type: "Skin", value: skinName },
          ]
        : [
            { trait_type: "Fee share", value: `${((facts.shareBps ?? 0) / 100).toFixed(2)}%` },
            // The mint is always emitted, the ticker only when resolvable: the
            // address is the fact, the ticker is the convenience.
            ...(subject ? [{ trait_type: "Subject", value: subject }] : []),
            ...(facts.subjectMint
              ? [{ trait_type: "Subject mint", value: facts.subjectMint }]
              : []),
            { trait_type: "Transferable", value: "Yes" },
            { trait_type: "Skin", value: skinName },
          ],
      properties: {
        category: "image",
        // Only our own render is known to be SVG.
        files: [{ uri: image, ...(isCustom ? {} : { type: "image/svg+xml" }) }],
      },
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
