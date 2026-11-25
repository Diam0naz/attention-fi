/**
 * Product scope for the current test — one loop, end to end:
 *
 *   opt in (verify the handle) → launch on the bonding curve with a
 *   mindshare-seeded price → trade → graduate to the AMM → claim creator fees
 *
 * plus the safety controls that protect that loop (disavowal, guardian pause,
 * launch policy). Everything else the program supports stays deployed and its
 * code stays in the repo, but the app does not expose it: no route, link,
 * panel, notification or transaction reaches past this scope.
 *
 * To bring a feature back, flip its flag here. Each flag is checked at every
 * entry point to that feature, so it comes back whole rather than in pieces.
 */

export type MechanismId = "bonding" | "dutch" | "conviction" | "revenue";

export const SCOPE = {
  /** Launch mechanisms a creator can choose. The test runs the bonding curve only. */
  mechanisms: ["bonding"] as readonly MechanismId[],
  /**
   * NFT market (including paid listing promotion), genesis fee-share runs,
   * collections, skins, stranded-card rescue.
   */
  nft: false,
  /** Earned trader perks and authority-granted perks. */
  perks: false,
} as const;

export function mechanismInScope(id: string): id is MechanismId {
  return (SCOPE.mechanisms as readonly string[]).includes(id);
}

/**
 * Page routes that belong to features outside the scope. The middleware
 * rewrites these to a route that doesn't exist, so a bookmarked or typed URL
 * gets a real 404 status; each segment's layout and pages also call
 * notFound() as a second line.
 */
export const OUT_OF_SCOPE_PATHS: readonly string[] = SCOPE.nft ? [] : ["/nft", "/rescue"];

export function isOutOfScopePath(pathname: string): boolean {
  return OUT_OF_SCOPE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

//
// The read-only metadata routes under /api/nft and /api/verification stay up:
// minted assets carry a permanent `uri` pointing at them, and wallets and
// explorers fetch it with no session, so cutting them would break NFTs people
// already hold. Routes that change state (buying a skin) refuse in their handlers.
