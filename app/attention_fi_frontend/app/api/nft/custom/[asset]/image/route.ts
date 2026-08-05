/**
 * Artwork for a plain AttentionFi NFT, rendered as SVG.
 *
 * Same approach as the perk and genesis cards: type and geometry, no font
 * loading and no raster dependency. The name comes from the on-chain account,
 * so this can't be made to render arbitrary text by changing the URL.
 */
import { skinById, DEFAULT_SKIN_ID } from "@/lib/nft-skins";
import { esc, readCoreAsset } from "@/lib/nft-metadata";

export const revalidate = 60;

/** Wrap a long name onto at most two lines so it stays inside the card. */
function wrap(name: string): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["AttentionFi NFT"];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > 16 && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && line) lines.push(line);
  return lines.slice(0, 2);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const decoded = await readCoreAsset(asset).catch(() => null);
  if (!decoded) return new Response("not found", { status: 404 });

  const skin = skinById(DEFAULT_SKIN_ID);
  const lines = wrap(decoded.name || "AttentionFi NFT");
  // Centre the block vertically whether it wrapped to one line or two.
  const startY = lines.length === 1 ? 320 : 285;

  const title = lines
    .map(
      (l, i) =>
        `<text x="300" y="${startY + i * 62}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="46" font-weight="700" fill="#F5F4F0">${esc(l)}</text>`,
    )
    .join("\n  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${skin.from}"/>
      <stop offset="100%" stop-color="${skin.to}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect x="18" y="18" width="564" height="564" rx="18" fill="none" stroke="${skin.accent}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="46" y="64" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" letter-spacing="5" fill="${skin.accent}">1 OF 1</text>
  ${title}
  <text x="300" y="548" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" fill="#6B6B6B">ATTENTIONFI</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
