#!/usr/bin/env bash
#
# deploy.sh — resilient Solana program deploy with buffer resume
#
# Handles the common failure mode where a large program deploy dies partway
# ("Blockhash expired" / "Max retries exceeded"), leaving a funded buffer
# on-chain. Instead of losing that buffer's rent and starting over, this
# script writes to a buffer FIRST, saves the buffer keypair to a file, and
# then deploys from it — so a failed run can be resumed without re-uploading
# everything or hunting for a 12-word seed phrase.
#
# Usage:
#   ./deploy.sh deploy      # write buffer (resumable) then deploy from it
#   ./deploy.sh resume      # resume a deploy from the saved buffer keypair
#   ./deploy.sh clean       # close all stranded buffers, reclaim rent
#   ./deploy.sh show        # show program + any open buffers
#
# Configure the variables below, then run.
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────
# CONFIG — edit these
# ─────────────────────────────────────────────────────────────────────────
PROGRAM_SO="target/deploy/attention_fi.so"
PROGRAM_KEYPAIR="target/deploy/attention_fi-keypair.json"   # program's keypair (defines program id)
# Must NOT be written as "~/..." — a tilde inside double quotes is not expanded
# by bash, so the CLI would receive a literal "~" directory name and fail with
# "No such file or directory (os error 2)". Use $HOME.
UPGRADE_AUTHORITY="${UPGRADE_AUTHORITY:-$HOME/.config/solana/id.json}"

# RPC. Prefer a dedicated/staked endpoint for deploys — the public and
# free-tier endpoints drop the many chunked write txns a deploy sends.
# Set HELIUS_API_KEY in your environment; do NOT hardcode it here.
: "${HELIUS_API_KEY:=}"
if [[ -n "$HELIUS_API_KEY" ]]; then
  RPC_URL="https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}"
else
  RPC_URL="https://api.devnet.solana.com"   # fallback
fi
# Override anytime:  RPC_URL=https://your-endpoint ./deploy.sh deploy
RPC_URL="${RPC_URL_OVERRIDE:-$RPC_URL}"

# Priority fee (micro-lamports per compute unit). Raise if writes keep
# expiring under congestion. 50000 is a reasonable devnet starting point.
COMPUTE_UNIT_PRICE="${COMPUTE_UNIT_PRICE:-50000}"

# How many times to re-sign dropped write chunks before giving up.
MAX_SIGN_ATTEMPTS="${MAX_SIGN_ATTEMPTS:-200}"

# Where to persist the buffer keypair between runs so we can resume.
BUFFER_KEYPAIR="deploy-buffer.json"

# ─────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────
log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

require() {
  command -v solana >/dev/null       || die "solana CLI not found on PATH"
  [[ -f "$PROGRAM_SO" ]]             || die "program .so not found: $PROGRAM_SO (run 'anchor build' first)"
  # Checked up front, not at deploy time: the upload takes many minutes, and
  # discovering a bad authority path only after it completes wastes the run.
  [[ -f "$UPGRADE_AUTHORITY" ]]      || die "upgrade authority keypair not found: $UPGRADE_AUTHORITY"
  [[ -f "$PROGRAM_KEYPAIR" ]]        || die "program keypair not found: $PROGRAM_KEYPAIR"
}

program_id() {
  if [[ -f "$PROGRAM_KEYPAIR" ]]; then
    solana address -k "$PROGRAM_KEYPAIR"
  else
    die "program keypair not found: $PROGRAM_KEYPAIR"
  fi
}

# ─────────────────────────────────────────────────────────────────────────
# write_buffer: upload the .so to a fresh buffer, saving its keypair so the
# deploy is resumable. If a saved buffer keypair already exists, reuse it
# (write-buffer resumes an incomplete buffer instead of starting fresh).
# ─────────────────────────────────────────────────────────────────────────
write_buffer() {
  require
  if [[ -f "$BUFFER_KEYPAIR" ]]; then
    log "Existing buffer keypair found ($BUFFER_KEYPAIR) — resuming its upload."
  else
    log "Generating a fresh buffer keypair: $BUFFER_KEYPAIR"
    solana-keygen new --no-bip39-passphrase --silent -o "$BUFFER_KEYPAIR"
  fi

  local buf_addr
  buf_addr="$(solana address -k "$BUFFER_KEYPAIR")"
  log "Buffer address: $buf_addr"
  log "Writing $PROGRAM_SO to buffer (RPC: $RPC_URL) ..."

  # write-buffer is idempotent-ish: pointed at an existing buffer keypair it
  # continues writing the remaining chunks rather than re-sending all of them.
  solana program write-buffer "$PROGRAM_SO" \
    --buffer "$BUFFER_KEYPAIR" \
    --with-compute-unit-price "$COMPUTE_UNIT_PRICE" \
    --max-sign-attempts "$MAX_SIGN_ATTEMPTS" \
    --url "$RPC_URL"

  log "Buffer fully written: $buf_addr"
}

# ─────────────────────────────────────────────────────────────────────────
# deploy_from_buffer: finalize the deploy using the written buffer.
# ─────────────────────────────────────────────────────────────────────────
deploy_from_buffer() {
  require
  [[ -f "$BUFFER_KEYPAIR" ]] || die "no buffer keypair ($BUFFER_KEYPAIR); run '$0 deploy' first"

  local pid
  pid="$(program_id)"
  log "Deploying program-id $pid from buffer ..."

  # If the program account doesn't exist yet this creates it; if it exists and
  # you're the upgrade authority, it upgrades it in place.
  solana program deploy \
    --program-id "$PROGRAM_KEYPAIR" \
    --buffer "$BUFFER_KEYPAIR" \
    --upgrade-authority "$UPGRADE_AUTHORITY" \
    --with-compute-unit-price "$COMPUTE_UNIT_PRICE" \
    --max-sign-attempts "$MAX_SIGN_ATTEMPTS" \
    --url "$RPC_URL" \
    "$PROGRAM_SO"

  log "Deploy succeeded. Program: $pid"
  log "Cleaning up local buffer keypair."
  rm -f "$BUFFER_KEYPAIR"
}

# ─────────────────────────────────────────────────────────────────────────
# commands
# ─────────────────────────────────────────────────────────────────────────
cmd_deploy() {
  write_buffer
  deploy_from_buffer
}

cmd_resume() {
  if [[ -f "$BUFFER_KEYPAIR" ]]; then
    log "Resuming from saved buffer keypair."
    # Make sure the buffer upload is complete, then deploy.
    write_buffer
    deploy_from_buffer
  else
    die "No $BUFFER_KEYPAIR to resume from.

If your failed deploy printed a 12-word seed phrase, recover it first:
  solana-keygen recover -o $BUFFER_KEYPAIR prompt://
then re-run: $0 resume"
  fi
}

cmd_show() {
  require
  local pid; pid="$(program_id)"
  log "Program account:"
  solana program show "$pid" --url "$RPC_URL" || warn "program not deployed yet"
  echo
  log "Open buffers owned by your wallet (each holds reclaimable rent):"
  solana program show --buffers --url "$RPC_URL" || true
}

cmd_clean() {
  require
  warn "Closing ALL open buffers owned by your wallet and reclaiming their rent."
  # `program close --buffers` closes every buffer you own in one shot.
  solana program close --buffers --url "$RPC_URL"
  rm -f "$BUFFER_KEYPAIR"
  log "Buffers closed, local buffer keypair removed."
}

main() {
  case "${1:-}" in
    deploy) cmd_deploy ;;
    resume) cmd_resume ;;
    show)   cmd_show ;;
    clean)  cmd_clean ;;
    *)
      cat <<EOF
Usage: $0 <command>

  deploy   Write program to a resumable buffer, then deploy from it.
  resume   Resume a deploy from the saved buffer keypair (deploy-buffer.json).
  show     Show the program account and any open buffers.
  clean    Close all open buffers and reclaim their rent.

Config via env vars:
  HELIUS_API_KEY        your Helius key (keeps it out of the script/history)
  RPC_URL_OVERRIDE      use any RPC URL directly
  COMPUTE_UNIT_PRICE    priority fee, micro-lamports/CU (default 50000)
  MAX_SIGN_ATTEMPTS     retry ceiling for dropped writes (default 200)

Examples:
  export HELIUS_API_KEY=xxxxxxxx
  ./deploy.sh deploy
  ./deploy.sh resume            # after a failure
  ./deploy.sh clean             # reclaim stranded rent
  RPC_URL_OVERRIDE=https://api.devnet.solana.com ./deploy.sh deploy
EOF
      exit 1 ;;
  esac
}

main "$@"