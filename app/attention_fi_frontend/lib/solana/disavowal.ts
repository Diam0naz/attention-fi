import { PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { disavowalPda } from "./program";

/** Why a token was disowned. Mirrors the program's `DisavowReason`. */
export type DisavowReason = "disowned" | "subjectGone" | "abuse";

/** What each reason means where a reader will see it. */
export const REASON_COPY: Record<DisavowReason, { label: string; blurb: string }> = {
  disowned: {
    label: "Disowned by its subject",
    blurb:
      "The account this token names has said it isn't theirs and objected to it. Nothing about the token's code is broken — what it claims about a person is disputed by that person.",
  },
  subjectGone: {
    label: "Subject's account is gone",
    blurb:
      "The account this token tracks no longer exists — deleted, suspended, or the person has died. Mindshare for it cannot be measured any more.",
  },
  abuse: {
    label: "Flagged for abuse",
    blurb:
      "Flagged as impersonation, harassment, or another policy breach.",
  },
};

export interface Disavowal {
  mint: string;
  disavowedBy: string;
  reason: DisavowReason;
  at: number;
}

/** Decode the program's enum, which Anchor hands back as `{ disowned: {} }`. */
function toReason(raw: Record<string, unknown>): DisavowReason {
  const key = Object.keys(raw)[0];
  return key === "subjectGone" || key === "abuse" ? key : "disowned";
}

/**
 * Whether a token has been disowned, or null when it hasn't.
 *
 * Null is overwhelmingly the normal case — almost no token is flagged — so
 * callers should treat a missing record as "fine" rather than as a failed read.
 */
export async function fetchDisavowal(
  program: Program<AttentionFi>,
  mint: PublicKey,
): Promise<Disavowal | null> {
  const raw = await program.account.tokenDisavowal
    .fetchNullable(disavowalPda(mint))
    .catch(() => null);
  if (!raw) return null;
  return {
    mint: raw.mint.toBase58(),
    disavowedBy: raw.disavowedBy.toBase58(),
    reason: toReason(raw.reason as Record<string, unknown>),
    at: Number(raw.at.toString()),
  };
}

/** Every disowned token, for the admin console. */
export async function fetchAllDisavowals(
  program: Program<AttentionFi>,
): Promise<Disavowal[]> {
  const all = await program.account.tokenDisavowal.all().catch(() => []);
  return all.map((a) => ({
    mint: a.account.mint.toBase58(),
    disavowedBy: a.account.disavowedBy.toBase58(),
    reason: toReason(a.account.reason as Record<string, unknown>),
    at: Number(a.account.at.toString()),
  }));
}

/** Flag a token. Authority or any one guardian. */
export async function disavowToken(
  program: Program<AttentionFi>,
  signer: PublicKey,
  mint: PublicKey,
  reason: DisavowReason,
): Promise<string> {
  return program.methods
    .disavowToken({ [reason]: {} } as never)
    .accountsPartial({ signer, mint, disavowal: disavowalPda(mint) })
    .rpc();
}

/** Lift a flag. Authority only. */
export async function restoreToken(
  program: Program<AttentionFi>,
  authority: PublicKey,
  mint: PublicKey,
): Promise<string> {
  return program.methods
    .restoreToken()
    .accountsPartial({ authority, mint, disavowal: disavowalPda(mint) })
    .rpc();
}
