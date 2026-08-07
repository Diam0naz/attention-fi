import { tokenByMint } from "@/lib/token-db";
import { staticHandleForMint } from "@/lib/solana/static-registry";

export interface SubjectLabels {
  /**
   * The token's name, resolved — `$SQN` or `@handle`. Null when we genuinely
   * don't know what it's called, which is the only case where a caller should
   * omit a "Subject" attribute rather than assert one.
   */
  name: string | null;
  /**
   * What to print in prose. Falls back to the shortened mint, because which
   * token pays is the fact a genesis NFT exists to carry and an address still
   * answers it — where "its token" answers nothing.
   */
  label: string | null;
}

const short = (mint: string) => `${mint.slice(0, 4)}…${mint.slice(-4)}`;

/**
 * Resolve a genesis NFT's subject mint to something a human can read.
 *
 * Shared by the metadata JSON and the SVG artwork so the same NFT can't name
 * its token in a wallet and not in a marketplace preview — they're two renders
 * of one asset and any disagreement between them reads as a bug in the NFT.
 *
 * Two sources, in order. The database holds tokens launched through the app,
 * with a name and symbol. The static registry holds tokens configured rather
 * than launched; it knows only handles, since a mapping in configuration is an
 * address book and not metadata. It's checked second so a real launch record
 * always wins, and checked at all because a configured token was previously
 * invisible to everything server-side — fully named in the browser, a raw mint
 * in the wallet showing the same NFT.
 */
export async function resolveSubject(mint: string | null | undefined): Promise<SubjectLabels> {
  if (!mint) return { name: null, label: null };

  const token = await tokenByMint(mint).catch(() => null);
  if (token) {
    return {
      name: token.symbol ? `$${token.symbol}` : `@${token.handle}`,
      label: token.symbol ? `$${token.symbol}` : `@${token.handle}`,
    };
  }

  const handle = staticHandleForMint(mint);
  if (handle) return { name: `@${handle}`, label: `@${handle}` };

  return { name: null, label: short(mint) };
}
