#!/usr/bin/env bash
# Push the env vars this app needs from a local .env into a linked Vercel
# project, so they don't have to be typed into the dashboard one at a time.
#
#   cd app/attention_fi_frontend
#   vercel login && vercel link      # once
#   ./scripts/vercel-env.sh preview  # or: production
#
# Only non-empty keys from the list below are sent. Existing values are left
# alone unless --force is passed, in which case they're removed and re-added.
#
# This uploads real secrets to Vercel. That is the point, but it is outward
# facing and hard to undo, so it prompts before sending anything.

set -euo pipefail

TARGET="${1:-preview}"
FORCE=""
[[ "${2:-}" == "--force" ]] && FORCE=1

ENV_FILE=".env"
[[ -f "$ENV_FILE" ]] || {
  echo "error: $ENV_FILE not found. Run this from app/attention_fi_frontend."
  exit 1
}

case "$TARGET" in
  preview | production | development) ;;
  *)
    echo "error: target must be preview | production | development (got '$TARGET')"
    exit 1
    ;;
esac

# Everything the deployed app reads. Anything absent or blank in .env is
# skipped, so a partial config is fine — features degrade rather than break.
KEYS=(
  DATABASE_URL
  NEYNAR_API_KEY
  MINDSHARE_SOURCE
  FARCASTER_MINDSHARE_TTL_S
  X_BEARER_TOKEN
  X_MINDSHARE_TTL_S
  SAS_ISSUER_SECRET_KEY
  SAS_CREDENTIAL_ADDRESS
  SAS_SCHEMA_ADDRESS
  SAS_RPC_ENDPOINT
  X_CLIENT_ID
  X_CLIENT_SECRET
  X_REDIRECT_URI
  X_OAUTH_SECRET
  NEXT_PUBLIC_X_OAUTH_ENABLED
  NEXT_PUBLIC_RPC_ENDPOINT
  NEXT_PUBLIC_SOLANA_CLUSTER
  NEXT_PUBLIC_PROGRAM_ID
  NEXT_PUBLIC_USDC_MINT
  NEXT_PUBLIC_TOKEN_REGISTRY
  NEXT_PUBLIC_MINDSHARE_FEED
  NEXT_PUBLIC_ALLOW_INDEXING
)

# Read a key's value from .env without sourcing it (avoids executing anything).
read_value() {
  local key="$1" line
  line="$(grep -m1 -E "^${key}=" "$ENV_FILE" || true)"
  [[ -z "$line" ]] && return 0
  local value="${line#*=}"
  # strip one layer of surrounding quotes, if present
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

present=()
for key in "${KEYS[@]}"; do
  [[ -n "$(read_value "$key")" ]] && present+=("$key")
done

if [[ ${#present[@]} -eq 0 ]]; then
  echo "Nothing to send — no matching non-empty keys in $ENV_FILE."
  exit 0
fi

echo "About to send ${#present[@]} variable(s) to the linked Vercel project ($TARGET):"
printf '  %s\n' "${present[@]}"
echo
read -r -p "Send these secrets to Vercel? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || {
  echo "Aborted; nothing was sent."
  exit 0
}

for key in "${present[@]}"; do
  if [[ -n "$FORCE" ]]; then
    vercel env rm "$key" "$TARGET" --yes >/dev/null 2>&1 || true
  fi
  if printf '%s' "$(read_value "$key")" | vercel env add "$key" "$TARGET" >/dev/null 2>&1; then
    echo "  set $key"
  else
    echo "  SKIP $key (already set? re-run with --force to replace)"
  fi
done

echo
echo "Done. Redeploy for the new values to take effect:  vercel deploy"
