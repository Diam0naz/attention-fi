// AttentionFi CCTP settlement keeper.
//
// Bridges USDC from Solana (the market engine's settlement asset) to Circle's Arc
// L1 via CCTP: burn on Solana -> Circle Iris attestation -> receiveMessage on Arc.
// CCTP is initiated off-chain, so the AttentionFi program is untouched.
//
// Run on devnet/mainnet only (needs real USDC + funded keepers on both chains):
//   npm i && npm run settle
//
// See ../README.md and ../../docs/CCTP.md.

import { wormhole, Wormhole, amount, TransferState } from "@wormhole-foundation/sdk";
import solana from "@wormhole-foundation/sdk/solana";
import evm from "@wormhole-foundation/sdk/evm";
import { getSolanaSignAndSendSigner } from "@wormhole-foundation/sdk-solana";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { loadConfig } from "./config.js";

async function main() {
  const cfg = loadConfig();

  // USDC has 6 decimals; CircleTransfer works in base units.
  const usdcBaseUnits = amount.units(amount.parse(cfg.amountUsdc, 6));

  const wh = await wormhole(cfg.network, [solana, evm]);
  const src = wh.getChain("Solana");
  // Arc is a Circle EVM chain. It must be recognised by the CCTP layer — if the
  // SDK registry doesn't yet include it, target Circle's raw CCTP domain instead
  // (see README). `destChain` is that integration seam.
  const dst = wh.getChain(cfg.destChain as Parameters<typeof wh.getChain>[0]);

  // Keeper signers on each side (from env; never committed).
  const srcSigner = await getSolanaSignAndSendSigner(
    await src.getRpc(),
    cfg.solanaKey,
  );
  const dstSigner = await getEvmSignerForKey(await dst.getRpc(), cfg.arcKey);

  const sender = Wormhole.chainAddress("Solana", srcSigner.address());
  const recipient = Wormhole.chainAddress(dst.chain, cfg.arcRecipient);

  console.log(`[settle] ${cfg.amountUsdc} USDC  Solana -> ${cfg.destChain} (${cfg.arcRecipient})`);

  // Manual (non-automatic) CCTP transfer.
  const xfer = await wh.circleTransfer(usdcBaseUnits, sender, recipient, false);

  // 1) Burn on Solana (depositForBurn).
  console.log("[1/3] burning USDC on Solana…");
  const burnTxids = await xfer.initiateTransfer(srcSigner);
  console.log("      burn txids:", burnTxids);

  // 2) Wait for Circle's Iris attestation.
  console.log("[2/3] waiting for Circle attestation…");
  const attestIds = await xfer.fetchAttestation(120_000);
  console.log("      attested:", attestIds);

  // 3) Receive (mint) on Arc.
  console.log("[3/3] minting USDC on Arc (receiveMessage)…");
  const mintTxids = await xfer.completeTransfer(dstSigner);
  console.log("      mint txids:", mintTxids);

  if (xfer.getTransferState() >= TransferState.DestinationFinalized) {
    console.log("[settle] done ✓");
  }
}

main().catch((err) => {
  console.error("[settle] failed:", err);
  process.exit(1);
});
