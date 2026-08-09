"use client";

import { useWallet } from "@/components/wallet/wallet-provider";
import { V0_GATE } from "@/lib/v0-gate";

export interface AppAccess {
  /** Whether the app's own surfaces should be reachable and advertised. */
  unlocked: boolean;
  /** True while the wallet session is still being restored — decide nothing yet. */
  pending: boolean;
}

/**
 * Who gets the app, and who gets the story.
 *
 * Connecting a wallet is what opens the product. Before that a visitor sees the
 * landing page and the live feed — enough to understand what this is and watch
 * it move — and the app's own surfaces (discover, terminal, launch, NFT,
 * profile) neither appear in navigation nor answer if typed. It reads as one
 * decision rather than a locked door: nothing is advertised that isn't yet
 * available.
 *
 * `V0_GATE` still overrides everything. That gate belongs to a deployment, not
 * a visitor — on the public site the app surfaces are redirected at the proxy,
 * so connecting a wallet there must not offer links the proxy will bounce.
 *
 * One hook so the nav, the footer and the route guard cannot disagree; three
 * copies of this rule would eventually mean a link to somewhere that turns you
 * away.
 */
export function useAppAccess(): AppAccess {
  const { connected, restoring } = useWallet();
  return {
    unlocked: !V0_GATE && connected,
    pending: !V0_GATE && restoring,
  };
}
