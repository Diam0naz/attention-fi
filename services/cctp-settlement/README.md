# CCTP Settlement Keeper

Bridges AttentionFi USDC from **Solana** to Circle's **Arc L1** via **CCTP**
(burn → Circle Iris attestation → mint on Arc). CCTP is initiated off-chain, so
the AttentionFi Anchor program is **not** involved — this is a standalone keeper.

See [`../../docs/CCTP.md`](../../docs/CCTP.md) for the full architecture.

## Prerequisites

- The keeper wallet holds **USDC on Solana** (CCTP moves USDC only). If the
  protocol accrues fees in SOL, realize them to USDC first (e.g. a Jupiter swap) —
  out of scope for this keeper.
- A funded keeper on the **Arc/EVM** side to submit `receiveMessage`.

## Configure (env — nothing committed)

```bash
export CCTP_NETWORK=Testnet            # or Mainnet
export ARC_CHAIN_NAME=Arc              # Wormhole/CCTP chain name for Arc (see caveat)
export SETTLE_AMOUNT_USDC=25.5
export ARC_RECIPIENT=0xYourArcAddress
export SOLANA_KEEPER_KEY='[12,34,...]' # json array or base58; holds the USDC
export ARC_KEEPER_KEY=0xyourEvmPrivKey # submits receiveMessage on Arc
```

## Run

```bash
npm install
npm run typecheck
npm run settle          # burn -> attest -> receive
```

> **Devnet/mainnet only.** This performs real cross-chain transfers and cannot be
> exercised in an offline sandbox.

## Arc support caveat

CCTP routes by **Circle domain id**. The Wormhole SDK maps its chain names to
those domains for the chains it knows. **Confirm that Circle's Arc is registered**
in the SDK version you install (`ARC_CHAIN_NAME`). If it isn't yet, target Arc via
Circle's **raw CCTP domain id** instead:

- Get Arc's CCTP domain + MessageTransmitter/TokenMessenger addresses from Circle's
  Arc docs (`developers.circle.com`).
- On Solana, call `depositForBurn` against the CCTP program
  (`CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3`) with `destinationDomain = <Arc>`.
- On Arc, call `receiveMessage(message, attestation)` on Arc's MessageTransmitter.

The Solana program ids are exported from [`src/config.ts`](src/config.ts) for that
raw-Circle path.
