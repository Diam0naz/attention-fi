/**
 * Perk / genesis artwork, rendered as PNG.
 *
 * PNG rather than SVG, which is what this used to serve. Phantom and Solflare
 * both proxy NFT images through their own CDN and refuse `image/svg+xml` —
 * SVG can carry scripts, so they won't render it. The card was being fetched
 * and then dropped, which looked from the outside like the styling simply
 * didn't apply to these NFTs.
 *
 * The asset's `uri` is permanent on-chain, but it points at the metadata JSON,
 * and that route builds this URL at request time — so changing the format here
 * repairs every NFT already minted, with no re-mint.
 *
 * Rendered with next/og (Satori + Resvg), which supports flexbox and a subset
 * of CSS. No custom font is loaded: the bundle ceiling is 500KB and these
 * cards are type and geometry, so the default face plus letter-spacing carries
 * the design.
 */
import { ImageResponse } from "next/og";
import { getAssetSkinWithUri } from "@/lib/skin-db";
import { CUSTOM_SKIN_ID } from "@/lib/nft-skins";
import { isSkinClass, paletteFor, readNftFacts } from "@/lib/nft-metadata";
import { resolveSubject } from "@/lib/nft-subject";

export const revalidate = 60;

const SIZE = 600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ class: string; asset: string }> },
) {
  const { class: cls, asset } = await params;
  if (!isSkinClass(cls)) return new Response("unknown class", { status: 404 });

  const facts = await readNftFacts(cls, asset);
  if (!facts) return new Response("not found", { status: 404 });

  const sel = await getAssetSkinWithUri(cls, asset).catch(() => ({
    skin: null,
    customUri: null,
  }));
  // Same as the badge: Signature has no palette to render, so hand the caller
  // straight to the artwork instead of fetching it here.
  if (sel.skin === CUSTOM_SKIN_ID && sel.customUri) {
    return Response.redirect(sel.customUri, 302);
  }
  const skin = paletteFor(facts, sel.skin);
  const isPerk = cls === "perk";

  const headline = isPerk
    ? `${((facts.discountBps ?? 0) / 100).toFixed(0)}% OFF`
    : `${((facts.shareBps ?? 0) / 100).toFixed(2)}%`;
  // A genesis NFT is a claim on one specific token's fees, so the artwork says
  // which. Resolved server-side because this render is what a wallet shows,
  // where the client-side token registry doesn't exist. Shares its resolution
  // with the metadata JSON so the two renders of the same asset can't disagree.
  const subject = isPerk ? null : (await resolveSubject(facts.subjectMint)).label;
  const kicker = isPerk ? `LEVEL ${facts.level}` : subject ? `${subject} FEES` : "FEE SHARE";
  const label = isPerk ? "PERK" : "GENESIS";
  const level = facts.level ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundImage: `linear-gradient(135deg, ${skin.from}, ${skin.to})`,
        }}
      >
        {/* Inset rule, matching the in-app card's border. */}
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            width: SIZE - 36 - 4,
            height: SIZE - 36 - 4,
            border: `2px solid ${skin.accent}`,
            opacity: 0.35,
            borderRadius: 18,
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 44,
            left: 46,
            display: "flex",
            fontSize: 17,
            letterSpacing: 5,
            color: skin.accent,
          }}
        >
          {label}
        </div>

        {/* Centre block: the figure, then what it's a figure of. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: SIZE,
            height: SIZE,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 86, fontWeight: 700, color: "#F5F4F0" }}>
            {headline}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 19,
              letterSpacing: 5,
              color: skin.accent,
            }}
          >
            {kicker}
          </div>

          {/* Perk levels get pips so the tier reads at a glance, the same way
              the in-app card shows them. */}
          {isPerk && (
            <div style={{ display: "flex", marginTop: 44, gap: 10 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 24,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i < level ? skin.accent : "#FFFFFF",
                    opacity: i < level ? 1 : 0.15,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 38,
            left: 0,
            width: SIZE,
            display: "flex",
            justifyContent: "center",
            fontSize: 15,
            letterSpacing: 2,
            color: "#6B6B6B",
          }}
        >
          ATTENTIONFI
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
