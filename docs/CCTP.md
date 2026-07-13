# Solana-core + Arc settlement via CCTP

> Status: **architecture + keeper design.** The AttentionFi program does **not**
> change — CCTP is initiated off-chain. This documents the settlement rail that
> connects the Solana market engine to Circle's Arc L1.

## Key facts (from feasibility probe)

- **CCTP is initiated off-chain**, by a wallet/keeper calling `depositForBurn` on
  the CCTP Solana program — there is **no CPI crate** and no reason to CPI from our
  program. The AttentionFi Anchor program stays untouched.
- CCTP moves **native USDC only** (burn-and-mint). AttentionFi currently collects
  fees in **SOL**, so a **"realize to USDC"** step is a prerequisite (see below).
- SDK: **`@wormhole-foundation/sdk-solana-cctp`** (thin wrapper over Circle CCTP on
  Solana). Circle's Iris API provides the attestation.
- CCTP Solana program IDs (public):
  - TokenMessengerMinter `CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3`
  - MessageTransmitter `CCTPmbSPurZoD7yGPjmQdb2fKZffTPTWzUJj9jFuoytoY`
- Arc is Circle's **EVM** L1 → the destination `receiveMessage` is Solidity-side
  (see `docs/ARC.md`), with Arc's CCTP **domain id** as the burn target.

## The settlement flow (keeper service)

```
Solana (source)                Circle Iris            Arc / EVM (destination)
---------------                -----------            -----------------------
depositForBurn(USDC,   ─────►  attest(messageHash) ─►  receiveMessage(message,
  destDomain=ARC,                                          attestation)
  mintRecipient=arcAddr)  ◄──  signed attestation         -> mints USDC on Arc
  -> burns USDC, emits msg
```

1. **Burn on Solana** — keeper calls `depositForBurn` for the USDC amount, with
   `destinationDomain = <Arc CCTP domain>` and `mintRecipient = <Arc recipient>`.
2. **Attest** — poll Circle Iris (`/v1/attestations/{messageHash}`) until the
   attestation is `complete`.
3. **Mint on Arc** — submit `receiveMessage(message, attestation)` to Arc's
   MessageTransmitter (EVM). USDC is minted natively to the recipient.

## How it composes with AttentionFi

The Solana program remains the market/mechanism engine. The settlement rail sits
beside it:

- **Protocol treasury → Arc.** Protocol-fee USDC accrued on Solana is periodically
  bridged to Arc treasury/ops.
- **Creator payouts → Arc.** A verified creator can elect USDC-on-Arc payouts;
  the keeper bridges their claimed fees.
- **EM-currency narrative tokens.** With USDC as the settlement asset on Arc, the
  brief's "NGN/USDC infrastructure for EM currencies" becomes an Arc-side product
  layer, sourced from Solana attention markets.

### Prerequisite: realize SOL fees to USDC

CCTP needs USDC. Two clean options (out of scope for the keeper itself):

- **Off-chain swap:** keeper swaps collected SOL → USDC (Jupiter) on Solana, then
  bridges. Simplest; no program change.
- **USDC-denominated fees (larger):** add a USDC fee path to the program so
  treasury/creator fees accrue directly in USDC. Bigger change; revisit if the
  product is USDC-first.

## Keeper skeleton (TypeScript)

```ts
// services/cctp-settlement/settle.ts  (devnet/mainnet; needs USDC + funded keeper)
import { wormhole } from "@wormhole-foundation/sdk";
import solana from "@wormhole-foundation/sdk/solana";
import evm from "@wormhole-foundation/sdk/evm";

// 1) burn on Solana, 2) fetch Circle attestation, 3) receive on Arc (EVM)
async function settleToArc(usdc: bigint, arcRecipient: string) {
  const wh = await wormhole("Testnet", [solana, evm]);
  const src = wh.getChain("Solana");
  const dst = wh.getChain("Arc");            // Arc registered as an EVM chain
  const cctp = await src.getCircleBridge();
  // depositForBurn -> messageId ; poll Iris ; receiveMessage on Arc
  // (see @wormhole-foundation/sdk-solana-cctp for the concrete calls)
}
```

## Why there's no program code here

CCTP is a wallet/keeper-initiated protocol. Adding a program CPI would only be
needed for *atomic in-instruction* bridging (advanced, unsupported by any crate,
untestable locally). For settlement, the off-chain keeper is the correct and
standard pattern — the program keeps emitting fees; the keeper bridges USDC.

## To build/run (checklist)

- [ ] Decide the SOL→USDC realization path (Jupiter swap vs USDC fee path).
- [ ] `npm i @wormhole-foundation/sdk @wormhole-foundation/sdk-solana-cctp @wormhole-foundation/sdk-evm`.
- [ ] Implement `settleToArc` (burn → Iris → Arc receive); config: RPCs, USDC mints, Arc domain/recipient, keeper key.
- [ ] Exercise on **devnet/testnet** with test USDC (cannot be run in an offline sandbox).
- [ ] Wire the Arc-side `receiveMessage` in the Arc EVM repo (separate from this Anchor workspace).
