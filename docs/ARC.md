# Arc L1 — Expansion assessment

> Status: **strategy note.** No code path yet; documents what "port to Arc"
> actually requires.

## What Arc is

Arc is **Circle's L1** — an **EVM-compatible** chain built for stablecoin finance
(USDC-native gas, FX/settlement). Evidence from the local `arc-escrow` project:
Solidity contracts (`RefundProtocol.sol`), a Circle copyright header,
`ARC-TESTNET`, and `api.circle.com` / `developers.circle.com` endpoints.

**Consequence:** AttentionFi is a **Solana / Anchor (SVM)** program. It does **not**
deploy to Arc via a config change — Arc runs the EVM. The txtx `svm` runbook
targets Solana-family RPCs only; it can't deploy this program to Arc.

## Options for an Arc presence

1. **Solana-core + Arc settlement rail (recommended).** Keep the built-and-tested
   program on Solana as the market/mechanism engine. Use Arc/Circle for the
   **stablecoin + EM-currency layer**: USDC/NGN-denominated narrative tokens,
   settlement, and payouts, bridged via **Circle CCTP**. This realizes the brief's
   "NGN/USDC infrastructure → narrative tokens for EM currencies" without a rewrite.

2. **Solidity port (major).** Re-implement the four mechanisms + NFT/fee logic in
   Solidity for Arc's EVM (Foundry/Hardhat). A ground-up rewrite — the on-chain
   accounting math ports conceptually, but nothing reuses. Only worth it if the
   strategy becomes Arc-first.

3. **Dual deployment.** Both chains, kept in sync — highest cost, only if there's
   demand on both.

## Recommendation

Treat Arc as a **future settlement/FX rail (Option 1)**, not a port. The Solana
program stays the core. Revisit a Solidity port only if AttentionFi pivots to
Arc-first distribution. Any Arc-side work is a separate EVM codebase, not part of
this Anchor workspace.
