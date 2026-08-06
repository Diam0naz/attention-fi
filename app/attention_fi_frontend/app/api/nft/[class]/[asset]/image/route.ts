/**
 * Perk / genesis artwork, rendered as SVG.
 *
 * SVG rather than a rasterised image so this needs no extra dependency and no
 * font loading — these cards are type and geometry. Wallets and explorers
 * accept image/svg+xml for NFT artwork.
 */
import { getAssetSkinWithUri } from "@/lib/skin-db";
import { CUSTOM_SKIN_ID } from "@/lib/nft-skins";
import { esc, isSkinClass, paletteFor, readNftFacts } from "@/lib/nft-metadata";
import { tokenByMint } from "@/lib/token-db";

export const revalidate = 60;

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
  // where the client-side token registry doesn't exist.
  //
  // When the mint isn't in the registry it degrades to the shortened mint
  // rather than a generic "FEE SHARE". Which token pays is the one fact this
  // card exists to carry, and an address still answers that; "FEE SHARE" only
  // repeats the label directly above it. Matches the in-app card, so the same
  // NFT doesn't identify its token in one place and not the other.
  let subject: string | null = null;
  if (!isPerk && facts.subjectMint) {
    const token = await tokenByMint(facts.subjectMint).catch(() => null);
    if (token) subject = token.symbol ? `$${token.symbol}` : `@${token.handle}`;
    else subject = `${facts.subjectMint.slice(0, 4)}…${facts.subjectMint.slice(-4)}`;
  }
  const kicker = isPerk ? `LEVEL ${facts.level}` : (subject ? `${subject} FEES` : "FEE SHARE");
  const label = isPerk ? "PERK" : "GENESIS";

  // Perk levels get pips so the tier is readable at a glance, the same way the
  // in-app card shows them.
  const pips = isPerk
    ? Array.from({ length: 5 }, (_, i) => {
        const on = i < (facts.level ?? 0);
        const x = 218 + i * 34;
        return `<rect x="${x}" y="430" width="24" height="6" rx="3" fill="${on ? skin.accent : "#FFFFFF"}" fill-opacity="${on ? 1 : 0.15}"/>`;
      }).join("\n  ")
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${skin.from}"/>
      <stop offset="100%" stop-color="${skin.to}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect x="18" y="18" width="564" height="564" rx="18" fill="none" stroke="${skin.accent}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="46" y="64" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" letter-spacing="5" fill="${skin.accent}">${esc(label)}</text>
  <text x="300" y="300" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="86" font-weight="700" fill="#F5F4F0">${esc(headline)}</text>
  <text x="300" y="352" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="19" letter-spacing="5" fill="${skin.accent}">${esc(kicker)}</text>
  ${pips}
  <text x="300" y="548" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" fill="#6B6B6B">ATTENTIONFI</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
