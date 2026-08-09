import { PublicKey } from "@solana/web3.js";
import type { Program } from "@anchor-lang/core";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import { guardiansPda } from "./program";

/** Most guardians the program will hold — mirrors `MAX_GUARDIANS`. */
export const MAX_GUARDIANS = 5;

export interface GuardianState {
  /** Live guardian keys, in slot order. */
  members: string[];
  /** Approvals needed to resume. Pausing always takes exactly one. */
  threshold: number;
  paused: boolean;
  /** Unix seconds the current pause began, or 0. */
  pausedAt: number;
  /** Guardians who have approved the current resume attempt. */
  approvals: string[];
}

/**
 * Read the emergency stop, or null when no set has been installed.
 *
 * Null is not an error and not "paused" — it is the state a freshly deployed
 * program is in, and the program reads an empty account the same way. Callers
 * should say "no guardians configured" rather than implying anything is wrong.
 */
export async function fetchGuardians(
  program: Program<AttentionFi>,
): Promise<GuardianState | null> {
  const raw = await program.account.guardians.fetchNullable(guardiansPda()).catch(() => null);
  if (!raw) return null;

  const count = Number(raw.count);
  return {
    members: raw.members.slice(0, count).map((m: PublicKey) => m.toBase58()),
    threshold: Number(raw.threshold),
    paused: raw.paused,
    pausedAt: Number(raw.pausedAt.toString()),
    approvals: raw.resumeApprovals
      .slice(0, Number(raw.resumeCount))
      .map((m: PublicKey) => m.toBase58()),
  };
}

/** Whether `address` may pull the stop. */
export function isGuardian(state: GuardianState | null, address: string | null): boolean {
  return state !== null && address !== null && state.members.includes(address);
}

/** Install or rotate the set. Authority only. */
export async function setGuardians(
  program: Program<AttentionFi>,
  authority: PublicKey,
  members: PublicKey[],
  threshold: number,
): Promise<string> {
  return program.methods
    .setGuardians(members, threshold)
    .accountsPartial({ authority, guardians: guardiansPda() })
    .rpc();
}

/** Halt every gated instruction. One guardian is enough. */
export async function pauseProtocol(
  program: Program<AttentionFi>,
  guardian: PublicKey,
): Promise<string> {
  return program.methods
    .pause()
    .accountsPartial({ guardian, guardians: guardiansPda() })
    .rpc();
}

/**
 * Approve resuming. The call that reaches the threshold lifts the pause.
 *
 * Deliberately one instruction rather than approve-then-execute: a separate
 * execute step is one more thing to forget while the protocol is down.
 */
export async function approveResume(
  program: Program<AttentionFi>,
  guardian: PublicKey,
): Promise<string> {
  return program.methods
    .resume()
    .accountsPartial({ guardian, guardians: guardiansPda() })
    .rpc();
}

/** Parse a textarea of guardian addresses, keeping the invalid ones visible. */
export function parseGuardians(raw: string): { valid: PublicKey[]; invalid: string[] } {
  const valid: PublicKey[] = [];
  const invalid: string[] = [];
  for (const line of raw.split(/[\s,]+/).filter(Boolean)) {
    try {
      valid.push(new PublicKey(line));
    } catch {
      invalid.push(line);
    }
  }
  return { valid, invalid };
}
