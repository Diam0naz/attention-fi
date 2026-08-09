import type { Program } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { fetchAllPools, type PoolState } from "./amm";
import { fetchAllCurves, fetchGlobal, type CurveState } from "./curve";
import type { CreatorFeeClaim } from "./creator-fees";
import { staticHandleForMint } from "./static-registry";

/** SPL Token program — where the wallet's token accounts live. */
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface TokenMeta {
  handle: string;
  symbol: string;
  name: string;
}

/**
 * One AttentionFi token the wallet holds, with the venue that prices it.
 *
 * `venue` mirrors ./venue's three states, derived here from the same signal:
 * a pool existing, not `curve.complete`, because `complete` is set the instant
 * the threshold is crossed while nothing trades until the pool is created.
 */
export interface WalletPosition {
  mint: string;
  /** Whole tokens held. */
  amount: number;
  curve: CurveState;
  pool: PoolState | null;
  venue: "curve" | "stranded" | "pool";
  meta: TokenMeta | null;
}

export interface WalletPositions {
  positions: WalletPosition[];
  decimals: number;
  feeBps: number;
  /**
   * Unclaimed creator fees, one entry per token this wallet launched.
   *
   * Per-token rather than a single total because `claim_creator_fee` is a
   * per-curve instruction: a lump sum can be displayed but not claimed, and the
   * screen showing it needs to know which mints to send.
   */
  claimable: CreatorFeeClaim[];
}

/**
 * Everything the connected wallet holds of AttentionFi tokens, in four reads.
 *
 * Shared by the profile (which prices these) and the notification bell (which
 * watches them change venue). Two independent copies of "what does this wallet
 * hold" is how the two surfaces end up disagreeing about whether a token has
 * graduated — the one question both exist to answer correctly.
 *
 * `getParsedTokenAccountsByOwner` over the whole token program returns every
 * balance at once, and the curves and pools each come back in one call, so this
 * doesn't scale with the number of tokens on the platform.
 */
export async function fetchWalletPositions(
  program: Program<AttentionFi>,
  connection: Connection,
  owner: PublicKey,
): Promise<WalletPositions> {
  const [accounts, curves, pools, global, tokensRes] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    fetchAllCurves(program),
    fetchAllPools(program),
    fetchGlobal(program).catch(() => null),
    fetch("/api/tokens").then((r) => (r.ok ? r.json() : { tokens: [] })),
  ]);

  const decimals = global?.tokenDecimals ?? 6;
  const feeBps = global?.feeBps ?? 100;

  // mint -> whole tokens held, summed across accounts for the same mint.
  const balances = new Map<string, number>();
  for (const acc of accounts.value) {
    const info = acc.account.data.parsed.info;
    const ui = info.tokenAmount?.uiAmount ?? 0;
    if (ui > 0) balances.set(info.mint, (balances.get(info.mint) ?? 0) + ui);
  }

  const meta = new Map<string, TokenMeta>();
  const tokenList = (
    tokensRes as { tokens?: { handle: string; mint: string; symbol?: string; name?: string }[] }
  ).tokens;
  for (const t of tokenList ?? []) {
    if (!t?.mint) continue;
    meta.set(t.mint, {
      handle: t.handle,
      symbol: t.symbol || t.handle.slice(0, 4).toUpperCase(),
      name: t.name || t.handle,
    });
  }

  const byMint = new Map(curves.map((c) => [c.mint, c]));
  const poolByMint = new Map(pools.map((p) => [p.mint, p]));

  const positions: WalletPosition[] = [];
  for (const [mint, amount] of balances) {
    const curve = byMint.get(mint);
    // No curve means it isn't an AttentionFi token — a wallet holds all sorts
    // of things, and listing them would be inventing coverage this app doesn't
    // have.
    if (!curve) continue;
    const pool = poolByMint.get(mint) ?? null;
    // The database first, then the configured seeds. Without the second lookup
    // a token that exists only in configuration has no handle here, and every
    // surface that routes by handle — the whole trade panel — gets a truncated
    // mint that resolves to nothing. The position still prices correctly off
    // the mint, so it looks held and untradeable at the same time.
    let entry = meta.get(mint) ?? null;
    if (!entry) {
      const handle = staticHandleForMint(mint);
      if (handle) {
        entry = { handle, symbol: handle.slice(0, 4).toUpperCase(), name: handle };
      }
    }
    positions.push({
      mint,
      amount,
      curve,
      pool,
      venue: pool ? "pool" : curve.complete ? "stranded" : "curve",
      meta: entry,
    });
  }

  // Every curve this wallet created that still owes it something. Curves with
  // a zero balance are dropped here rather than at the call site, because the
  // program rejects a zero claim and a row offering one would only ever fail.
  const claimable: CreatorFeeClaim[] = [];
  for (const c of curves) {
    if (c.creator !== owner.toBase58() || c.creatorFees === 0n) continue;
    const entry = meta.get(c.mint) ?? null;
    const handle = entry?.handle ?? staticHandleForMint(c.mint);
    claimable.push({
      mint: c.mint,
      handle: handle ?? `${c.mint.slice(0, 6)}…`,
      symbol: entry?.symbol ?? (handle ? handle.slice(0, 4).toUpperCase() : "—"),
      lamports: c.creatorFees,
    });
  }
  claimable.sort((a, b) => (b.lamports > a.lamports ? 1 : b.lamports < a.lamports ? -1 : 0));

  return { positions, decimals, feeBps, claimable };
}
