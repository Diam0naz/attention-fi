import { PublicKey, Transaction } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { curvePda, verificationPda } from "./program";

/**
 * How many claims ride in one transaction.
 *
 * `claim_creator_fee` carries four accounts and no arguments, so the binding
 * constraint is neither size nor compute — it's blast radius. A creator with
 * twenty launched tokens shouldn't lose the whole sweep because the nineteenth
 * curve had nothing in it. Six keeps a failed batch small enough to retry
 * without re-signing everything.
 */
const CLAIMS_PER_TX = 6;

/** One token's unclaimed creator fees. */
export interface CreatorFeeClaim {
  mint: string;
  /** Display handle where the registry knows one, else a truncated mint. */
  handle: string;
  symbol: string;
  /** Unclaimed lamports sitting on the curve. */
  lamports: bigint;
}

/**
 * Claim the creator's accrued fees on one token.
 *
 * The `verification` account is not optional and has no `init` — an unverified
 * creator cannot construct a valid transaction at all, which is the program's
 * way of saying fees belong to the X account, not to whoever launched the mint.
 * Callers should check verification first and say so, because the raw failure
 * (`AccountNotInitialized` on a PDA the user has never heard of) explains
 * nothing.
 */
export async function claimCreatorFee(
  program: Program<AttentionFi>,
  creator: PublicKey,
  mint: PublicKey,
): Promise<string> {
  return program.methods
    .claimCreatorFee()
    .accountsPartial({
      creator,
      mint,
      curve: curvePda(mint),
      verification: verificationPda(creator),
    })
    .rpc();
}

/**
 * Sweep several tokens' fees, batched into as few transactions as possible.
 *
 * Mints with nothing accrued are dropped rather than sent: `claim_creator_fee`
 * rejects a zero balance with `NoCreatorFees`, and one empty curve in a batch
 * would fail the whole transaction — taking the non-empty claims alongside it.
 *
 * Returns the signatures that landed. A partial sweep is reported as a partial
 * sweep rather than an error, since the batches that succeeded really did pay
 * out and the caller needs to reflect that.
 */
export async function claimAllCreatorFees(
  program: Program<AttentionFi>,
  creator: PublicKey,
  claims: readonly CreatorFeeClaim[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ signatures: string[]; claimed: number; error: Error | null }> {
  const worth = claims.filter((c) => c.lamports > 0n);
  const batches: CreatorFeeClaim[][] = [];
  for (let i = 0; i < worth.length; i += CLAIMS_PER_TX) {
    batches.push(worth.slice(i, i + CLAIMS_PER_TX));
  }

  const signatures: string[] = [];
  let claimed = 0;
  onProgress?.(0, batches.length);

  for (const [i, batch] of batches.entries()) {
    try {
      const tx = new Transaction();
      for (const claim of batch) {
        const mint = new PublicKey(claim.mint);
        tx.add(
          await program.methods
            .claimCreatorFee()
            .accountsPartial({
              creator,
              mint,
              curve: curvePda(mint),
              verification: verificationPda(creator),
            })
            .instruction(),
        );
      }
      signatures.push(
        await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" }),
      );
      claimed += batch.length;
      onProgress?.(i + 1, batches.length);
    } catch (e) {
      // Stop here rather than pressing on: every remaining batch would most
      // likely fail the same way (a rejected signature, a dropped connection),
      // and asking the wallet to sign five more doomed transactions is worse
      // than reporting what landed.
      return {
        signatures,
        claimed,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  return { signatures, claimed, error: null };
}
