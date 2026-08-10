/**
 * Jurisdictions the app's trading surfaces are not offered in.
 *
 * The pre-launch checklist puts this at HIGH and gives the precedent: Pump.fun
 * was added to the FCA warning list and had to emergency geo-block the UK in
 * December 2024. Doing it under pressure, after a regulator has already
 * published your name, is materially worse than doing it now — the block is the
 * same code either way, but one version arrives with a press cycle attached.
 *
 * Deliberately narrow. This blocks the *app*: trading, launching, the NFT
 * market, the profile. It does not block the landing page or the feed, because
 * reading about a product and publicly-visible market data is not the regulated
 * activity, and a blanket block would also stop a UK visitor reading the
 * disclosure explaining why they're blocked.
 */

/** ISO 3166-1 alpha-2 codes. */
export const BLOCKED_COUNTRIES = new Set(["GB"]);

/**
 * Whether a request from `country` may reach the app's trading surfaces.
 *
 * An unknown country is allowed through. Geo-IP is a hint, not a fact: proxies,
 * corporate VPNs and datacentre ranges routinely resolve to nothing, and
 * defaulting those to "blocked" would turn a compliance measure into an
 * outage for people it was never aimed at. The check exists to stop offering
 * the product where it shouldn't be offered, not to prove where anyone is.
 */
export function isBlockedCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return BLOCKED_COUNTRIES.has(country.toUpperCase());
}

/** Where a blocked visitor is sent. */
export const BLOCKED_PATH = "/unavailable";
