#!/usr/bin/env bash
# Deploy the AttentionFi program to devnet and initialize Global.
# Requires the deploy wallet (~/.config/solana/id.json) funded with >= 8 SOL.
set -euo pipefail

CLUSTER_URL="https://api.devnet.solana.com"
PROGRAM_ID="8fQW2JbfNytdjJ7LR8dvKWMUtpeQPRqxAa3JZvBLsVVc"
SO="target/deploy/attention_fi.so"
MIN_SOL=8

command -v solana >/dev/null || { echo "error: solana CLI not found"; exit 1; }
command -v anchor >/dev/null || { echo "error: anchor CLI not found"; exit 1; }
[[ -f "$SO" ]] || { echo "error: $SO missing — run 'anchor build' first"; exit 1; }

wallet="$(solana address)"
echo "Deploy wallet : ${wallet}"

balance="$(solana balance --url "$CLUSTER_URL" | awk '{print $1}')"
echo "Devnet balance: ${balance} SOL"

if ! awk -v b="$balance" -v m="$MIN_SOL" 'BEGIN { exit !(b + 0 >= m) }'; then
  echo "error: need >= ${MIN_SOL} SOL (~7.34 rent + fees). Fund ${wallet} on devnet, then re-run." >&2
  exit 1
fi

echo "Deploying ${PROGRAM_ID} to devnet..."
anchor deploy \
  --provider.cluster devnet \
  --provider.wallet "${HOME}/.config/solana/id.json" \
  || { echo "error: anchor deploy failed"; exit 1; }

echo "Initializing Global..."
ANCHOR_PROVIDER_URL="$CLUSTER_URL" \
  ANCHOR_WALLET="${HOME}/.config/solana/id.json" \
  npx ts-node scripts/init-global.ts \
  || { echo "error: Global init failed"; exit 1; }

echo "Done — live at https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet"
