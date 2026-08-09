#!/usr/bin/env python3
"""Craft Solana Attestation Service `Attestation` accounts for localnet tests.

`verify_handle` only *reads* an attestation account (owner-check + borsh decode +
field validation); it never CPIs into the SAS program. So instead of driving the
SAS program on localnet, we preload crafted attestation accounts (owned by the
SAS program id) via `solana-test-validator --account`. This mirrors the exact
borsh layout of `solana_attestation_service_client::accounts::Attestation`.
"""

import argparse
import base64
import json
import struct
from pathlib import Path

SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG"


def pubkey_bytes(keypair_path: str) -> bytes:
    """Last 32 bytes of a 64-byte Solana keypair file are the public key."""
    arr = json.loads(Path(keypair_path).read_text())
    return bytes(arr[32:64])


def attestation_data(nonce: bytes, signer: bytes, handle: str, expiry: int) -> bytes:
    handle_bytes = handle.encode("utf-8")
    return b"".join(
        [
            bytes([2]),  # discriminator (Attestation); not validated by our program
            nonce,  # 32
            bytes(32),  # credential (unused by our checks)
            bytes(32),  # schema (unused by our checks)
            struct.pack("<I", len(handle_bytes)) + handle_bytes,  # data: Vec<u8>
            signer,  # 32
            struct.pack("<q", expiry),  # i64
            bytes(32),  # token_account
        ]
    )


def write_account(path: str, data: bytes) -> None:
    account = {
        "pubkey": "11111111111111111111111111111111",  # overridden by --account ADDR
        "account": {
            "lamports": 10_000_000,
            "data": [base64.b64encode(data).decode(), "base64"],
            "owner": SAS_PROGRAM_ID,
            "executable": False,
            "rentEpoch": 18446744073709551615,
            "space": len(data),
        },
    }
    Path(path).write_text(json.dumps(account))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--issuer", required=True, help="protocol authority keypair (valid signer)")
    ap.add_argument("--subject", required=True, help="wallet being verified (valid nonce)")
    ap.add_argument("--subject2", required=True, help="second wallet (invalid-case nonce)")
    ap.add_argument("--bad", required=True, help="unauthorized signer keypair (invalid case)")
    ap.add_argument("--handle", required=True)
    ap.add_argument("--outdir", required=True)
    args = ap.parse_args()

    subject = pubkey_bytes(args.subject)
    subject2 = pubkey_bytes(args.subject2)
    issuer = pubkey_bytes(args.issuer)
    bad = pubkey_bytes(args.bad)
    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)

    # Valid: signed by the protocol issuer, nonce == subject, no expiry.
    write_account(
        str(out / "att_valid.json"),
        attestation_data(subject, issuer, args.handle, 0),
    )
    # Invalid: signed by an unauthorized key (rejected: Unauthorized). Uses a
    # distinct nonce so its verification PDA is fresh and the failure is the
    # signer check, not a PDA collision.
    write_account(
        str(out / "att_invalid.json"),
        attestation_data(subject2, bad, args.handle, 0),
    )
    # The issuer verifying itself. `claim_creator_fee` is gated on the claimant
    # holding a Verification PDA, and the claimant in those tests is the local
    # wallet — which is also the issuer, so nonce and signer are the same key.
    write_account(
        str(out / "att_wallet.json"),
        attestation_data(issuer, issuer, args.handle, 0),
    )
    print("wrote att_valid.json, att_invalid.json and att_wallet.json to", out)


if __name__ == "__main__":
    main()
