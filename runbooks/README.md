# AttentionFi Runbooks

[![Txtx](https://img.shields.io/badge/Operated%20with-Txtx-green?labelColor=gray)](https://txtx.sh)

On-chain operations for AttentionFi, managed as **Crypto Infrastructure as Code**
with [txtx](https://txtx.sh) — reproducible, reviewable, and composable deploys
across localnet / devnet / mainnet.

## Available runbooks

### `deployment`
Deploys the AttentionFi Anchor program and registers **subgraphs** for its
on-chain events (`LaunchEvent`, `TradeEvent`, `GraduateEvent`,
`PoolCreatedEvent`, `AmmSwapEvent`, `CreatorClaimEvent`) — the indexing layer
behind the live mindshare feed.

## Usage

Install txtx:

```console
curl -sL https://install.txtx.sh/ | bash
```

Build the program first so the runbook can pick up the compiled artifact + IDL:

```console
anchor build
```

Run the deployment against an environment defined in [`../txtx.yml`](../txtx.yml):

```console
# localnet (uses ~/.config/solana/id.json)
txtx run deployment --env localnet

# devnet (signs with a connected web wallet)
txtx run deployment --env devnet
```

## Layout

```
runbooks/deployment/
├── main.tx                 # svm addon + deploy_program action
├── signers.localnet.tx     # secret_key signers (local keypair)
├── signers.devnet.tx       # web_wallet signers
├── signers.mainnet.tx      # hardware / Squads multisig (templated)
└── subgraphs.localnet.tx   # event subgraphs for the live feed
```

## Environments

Defined in `txtx.yml` at the repo root: `localnet`, `devnet`, `mainnet`.
Swap the devnet `rpc_api_url` for a Helius (or other) endpoint as needed —
do **not** commit API keys.

> Mainnet deployments must use a hardware/web wallet or a Squads multisig for the
> upgrade authority — never an on-disk keypair.
