/**
 * A launched token's picture.
 *
 * Three cases, and the difference between them is about trust rather than
 * convenience.
 *
 * A creator's uploaded image arrives as a `data:` URI in the launch registry.
 * Serving those bytes back means this origin is handing out content someone
 * else chose, so the type is taken from a whitelist rather than from the URI:
 * a `data:text/html` (or an SVG, which carries script) served from our own
 * origin is stored XSS against every reader of the token page. SVG is refused
 * outright and loses nothing — Phantom and Solflare proxy NFT images and reject
 * `image/svg+xml` anyway, which is why the other card routes render PNG.
 *
 * A pasted `https:` URL is redirected to, never fetched. Following it
 * server-side would make this endpoint a request forwarder pointed at an
 * address the creator controls.
 *
 * With no artwork at all, the ticker is drawn. A generated card is better than
 * a broken-image icon in a wallet, and it can't be anything but ours.
 */
import { ImageResponse } from "next/og";
import { readTokenFacts, RpcUnavailable } from "@/lib/token-facts";
import { skinById, DEFAULT_SKIN_ID } from "@/lib/nft-skins";

export const revalidate = 60;

const SIZE = 600;

/** Raster types a wallet will actually display. Deliberately excludes SVG. */
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const DATA_URI = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** Decode a creator-supplied data URI, or null when it isn't a safe image. */
function decodeDataUri(value: string): { body: Buffer; type: string } | null {
  const m = DATA_URI.exec(value.trim());
  if (!m) return null;
  const type = m[1]!.toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return null;
  try {
    const body = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
    return body.length > 0 ? { body, type } : null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;

  let facts;
  try {
    facts = await readTokenFacts(mint);
  } catch (e) {
    if (!(e instanceof RpcUnavailable)) throw e;
    return new Response("upstream unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  if (!facts) return new Response("not found", { status: 404 });

  if (facts.image) {
    const decoded = decodeDataUri(facts.image);
    if (decoded) {
      return new Response(new Uint8Array(decoded.body), {
        headers: {
          "content-type": decoded.type,
          // The type is whitelisted above; this stops a browser overriding it
          // by sniffing the bytes and finding something it would rather run.
          "x-content-type-options": "nosniff",
          "content-disposition": "inline",
          "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        },
      });
    }
    if (/^https:\/\//i.test(facts.image.trim())) {
      return Response.redirect(facts.image.trim(), 302);
    }
  }

  const skin = skinById(DEFAULT_SKIN_ID);
  const ticker = facts.symbol || facts.name;
  // Long tickers would overflow the card; scale the type down rather than clip.
  const fontSize = ticker.length > 8 ? 64 : ticker.length > 5 ? 84 : 104;

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
        <div style={{ display: "flex", fontSize, fontWeight: 700, color: "#F5F4F0" }}>
          {ticker}
        </div>
        {facts.handle && (
          <div style={{ display: "flex", marginTop: 16, fontSize: 26, color: skin.accent }}>
            @{facts.handle}
          </div>
        )}
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
