/**
 * Artwork for a plain AttentionFi NFT, rendered as PNG.
 *
 * PNG rather than SVG for the same reason as the other cards: wallets proxy
 * NFT images and refuse `image/svg+xml`. See
 * app/api/nft/[class]/[asset]/image/route.tsx.
 *
 * The name comes from the on-chain account, so this can't be made to render
 * arbitrary text by changing the URL. Satori escapes text nodes itself, so
 * unlike the SVG version there is nothing to escape by hand.
 */
import { ImageResponse } from "next/og";
import { skinById, DEFAULT_SKIN_ID } from "@/lib/nft-skins";
import { readCoreAsset } from "@/lib/nft-metadata";

export const revalidate = 60;

const SIZE = 600;

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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          backgroundImage: `linear-gradient(135deg, ${skin.from}, ${skin.to})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            width: SIZE - 40,
            height: SIZE - 40,
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
          1 OF 1
        </div>

        {/* Flexbox centres the block whether it wrapped to one line or two, so
            unlike the SVG this needs no start-y adjustment. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {lines.map((l, i) => (
            <div
              key={i}
              style={{ display: "flex", fontSize: 46, fontWeight: 700, color: "#F5F4F0" }}
            >
              {l}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 38,
            display: "flex",
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
      headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
    },
  );
}
