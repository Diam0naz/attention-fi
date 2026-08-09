#!/usr/bin/env bash
#
# localnet.sh — start a validator the whole test suite can actually run against.
#
# `anchor test` alone cannot run this suite. Two of its describes need Solana
# Attestation Service accounts, and those cannot be committed to the repo: the
# program checks `attestation.signer == global.authority`, and the authority is
# whoever ran `initialize` — i.e. the local wallet, which differs per machine.
# A checked-in fixture would be bound to one developer's keypair and fail for
# everyone else. So the fixtures are generated here, against whatever wallet is
# configured, immediately before the validator loads them.
#
# The other two dependencies are external programs, cloned from devnet:
# mpl-core (every NFT path) and token-metadata (every launch).
#
# Usage:
#   ./scripts/localnet.sh              # generate fixtures, start validator
#   ./scripts/localnet.sh --fixtures   # regenerate fixtures only
#
# Then, in another shell:
#   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
#   ANCHOR_WALLET=~/.config/solana/id.json \
#   yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/attention_fi.ts
set -euo pipefail

WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
RPC_PORT="${RPC_PORT:-8899}"
CLONE_FROM="${CLONE_FROM:-https://api.devnet.solana.com}"
HANDLE="${HANDLE:-vitalik}"

# Generated, never committed — see the note above about machine-specific keys.
WORK="target/localnet"
FIXTURES="tests/fixtures"

MPL_CORE="CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
TOKEN_METADATA="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
PROGRAM_ID="8fQW2JbfNytdjJ7LR8dvKWMUtpeQPRqxAa3JZvBLsVVc"
PROGRAM_SO="target/deploy/attention_fi.so"

log() { printf '\033[1;34m[localnet]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

command -v solana-test-validator >/dev/null || die "solana-test-validator not on PATH"
command -v python3 >/dev/null || die "python3 not on PATH"
[[ -f "$WALLET" ]] || die "wallet not found: $WALLET"
[[ -f "$PROGRAM_SO" ]] || die "$PROGRAM_SO missing — run 'anchor build' first"

generate_fixtures() {
  mkdir -p "$WORK"
  # Throwaway identities. None of them ever signs a transaction — the program
  # only reads their pubkeys out of the attestation — so they are regenerated
  # freely rather than kept.
  # `_kp` suffix deliberately: gen_sas_fixtures.py writes *account* files named
  # att_valid.json / att_invalid.json / att_wallet.json into the same directory,
  # and without the suffix those overwrite the keypairs that define their
  # addresses.
  for name in subject subject2 bad att_valid_kp att_invalid_kp att_wallet_kp; do
    [[ -f "$WORK/$name.json" ]] ||
      solana-keygen new --no-bip39-passphrase --silent -o "$WORK/$name.json"
  done

  python3 "$FIXTURES/gen_sas_fixtures.py" \
    --issuer "$WALLET" \
    --subject "$WORK/subject.json" \
    --subject2 "$WORK/subject2.json" \
    --bad "$WORK/bad.json" \
    --handle "$HANDLE" \
    --outdir "$WORK"

  # The address book the tests read, derived from the same keypairs the
  # attestations were built from so the two cannot drift.
  local subject subject2 att_valid att_invalid att_wallet wallet_addr
  subject="$(solana address -k "$WORK/subject.json")"
  subject2="$(solana address -k "$WORK/subject2.json")"
  att_valid="$(solana address -k "$WORK/att_valid_kp.json")"
  att_invalid="$(solana address -k "$WORK/att_invalid_kp.json")"
  att_wallet="$(solana address -k "$WORK/att_wallet_kp.json")"
  wallet_addr="$(solana address -k "$WALLET")"

  cat > "$FIXTURES/sas.json" <<JSON
{
  "subject": "${subject}",
  "subject2": "${subject2}",
  "attValid": "${att_valid}",
  "attInvalid": "${att_invalid}",
  "handle": "${HANDLE}",
  "attWallet": "${att_wallet}",
  "wallet": "${wallet_addr}"
}
JSON
  log "Fixtures written for wallet ${wallet_addr}"
}

generate_fixtures
[[ "${1:-}" == "--fixtures" ]] && exit 0

log "Starting validator on port ${RPC_PORT} (cloning mpl-core + token-metadata from ${CLONE_FROM})"
exec solana-test-validator \
  --reset \
  --ledger "$WORK/ledger" \
  --rpc-port "$RPC_PORT" \
  --url "$CLONE_FROM" \
  --clone-upgradeable-program "$MPL_CORE" \
  --clone-upgradeable-program "$TOKEN_METADATA" \
  --bpf-program "$PROGRAM_ID" "$PROGRAM_SO" \
  --account "$(solana address -k "$WORK/att_valid_kp.json")" "$WORK/att_valid.json" \
  --account "$(solana address -k "$WORK/att_invalid_kp.json")" "$WORK/att_invalid.json" \
  --account "$(solana address -k "$WORK/att_wallet_kp.json")" "$WORK/att_wallet.json"
