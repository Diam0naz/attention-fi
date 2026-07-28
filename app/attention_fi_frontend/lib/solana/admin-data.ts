import type { Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";

/**
 * A perk the protocol has authorised but the recipient hasn't claimed.
 *
 * Grants are the admin's outstanding liability: each one is a fee discount
 * already promised, so the admin view needs them as a list rather than a count.
 */
export interface PerkGrantData {
  recipient: string;
  level: number;
  granter: string;
  /** PDA address, useful for explorer links. */
  address: string;
}

export async function fetchPerkGrants(program: Program<AttentionFi>): Promise<PerkGrantData[]> {
  const all = await program.account.perkGrant.all();
  return all
    .map((g) => ({
      recipient: g.account.recipient.toBase58(),
      level: g.account.level,
      granter: g.account.granter.toBase58(),
      address: g.publicKey.toBase58(),
    }))
    .sort((a, b) => b.level - a.level);
}

/** Perks that have actually been claimed — the granted-vs-claimed gap. */
export interface ClaimedPerkData {
  owner: string;
  level: number;
  discountBps: number;
}

export async function fetchClaimedPerks(program: Program<AttentionFi>): Promise<ClaimedPerkData[]> {
  const all = await program.account.perkNft.all();
  return all.map((p) => ({
    owner: p.account.owner.toBase58(),
    level: p.account.level,
    discountBps: p.account.discountBps,
  }));
}

/**
 * Parse a pasted recipient list into addresses.
 *
 * Accepts newline, comma or whitespace separation, since the realistic input is
 * a column pasted out of a spreadsheet or a task-board export. Invalid entries
 * are returned rather than dropped: silently skipping a malformed address would
 * mean a recipient quietly never gets their perk.
 */
export function parseRecipients(raw: string): { valid: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    try {
      const key = new PublicKey(t).toBase58();
      // De-duplicate: one grant PDA per recipient, so a repeat in the paste
      // would fail the whole batch on an already-in-use account.
      if (!seen.has(key)) {
        seen.add(key);
        valid.push(key);
      }
    } catch {
      invalid.push(t);
    }
  }
  return { valid, invalid };
}
