/** Shared between the one-time setup script and the /api/verify route so the
 *  Attestation `data` layout and the message a wallet signs stay in lockstep. */

export const SAS_CREDENTIAL_NAME = "attentionfi";
export const SAS_SCHEMA_NAME = "handle-verification";
export const SAS_SCHEMA_VERSION = 1;

/** How long an issued attestation remains usable to mint a Verification NFT. */
export const SAS_ATTESTATION_TTL_S = 365 * 24 * 60 * 60;

/** Must exactly match the copy shown in VerifyHandleFlow — a wallet should
 *  never be asked to sign something other than what it's shown on screen. */
export function verifyMessage(handle: string, wallet: string): string {
  return `I am @${handle} and I authorize AttentionFi to attest this handle to ${wallet}.`;
}

/** Borsh-`String` layout (u32 LE length + utf8 bytes) — `verify_handle` only
 *  requires the handle's bytes appear somewhere in `data`, so a single-field
 *  encoding is sufficient and matches the Rust test fixtures exactly. */
export function encodeHandleData(handle: string): Uint8Array {
  const bytes = new TextEncoder().encode(handle);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

/** Inverse of encodeHandleData: read the handle bound in an attestation's
 *  `data` field so /api/verify can tell whether an existing attestation is for
 *  the handle being requested (an attestation is one-per-wallet). */
export function decodeHandleData(data: Uint8Array): string {
  if (data.length < 4) return "";
  const len = data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24);
  if (len < 0 || len > data.length - 4) return "";
  return new TextDecoder().decode(data.slice(4, 4 + len));
}

export const MAX_HANDLE_LEN = 32;
