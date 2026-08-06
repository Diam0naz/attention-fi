/**
 * Resolve an on-chain `uri` to something an `<img>` can actually render.
 *
 * Artwork is optional at mint. When it's omitted the asset's `uri` is written
 * as this app's *metadata* route — a JSON document describing the NFT, not the
 * NFT's picture. That's the right thing to put on-chain (wallets read
 * metadata), but dropping it straight into an `<img>` renders nothing, which
 * is why assets minted without artwork appeared blank in the app while looking
 * correct in a wallet.
 *
 * Every metadata route here has an `/image` sibling that returns the SVG card.
 * A `uri` that isn't one of ours is assumed to be direct artwork and passed
 * through untouched — that's the case when the minter supplied their own URL.
 */

/** `/api/nft/<class>/<asset>` and `/api/verification/<subject>`, without a
 *  trailing segment of their own. Anything already ending in `/image` fails
 *  this test and is left alone. */
const METADATA_PATH = /^\/api\/(?:nft\/[^/]+|verification)\/[^/]+$/;

export function artworkUrl(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    // Not an absolute URL. Nothing safe to derive, so hand it back as-is
    // rather than guessing at an origin.
    return uri;
  }
  if (!METADATA_PATH.test(url.pathname)) return uri;
  // Rebuilt through the URL object so a query string stays after the path
  // instead of being swallowed by the appended segment.
  url.pathname = `${url.pathname}/image`;
  return url.toString();
}
