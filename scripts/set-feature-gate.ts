/**
 * Switch product features off (or back on) for new entries, on-chain.
 *
 * Pairs with the frontend's lib/scope.ts: the app hides cut features, and this
 * stops anyone calling them directly against the program. A disabled feature
 * refuses new entries (launching, listing, minting, bidding, buying) and leaves
 * exits open (selling, settling, reclaiming, burning, claiming).
 *
 * Features are named, not passed as a raw mask:
 *
 *   dutch, conviction, revenue, nft, perks
 *
 * The current test scope (bonding curve only) disables all five:
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=/path/to/authority.json \
 *   npx ts-node scripts/set-feature-gate.ts dutch conviction revenue nft perks
 *
 * Run with no names to switch everything back on. Safe to re-run: it writes
 * the full set each time, so the result never depends on what was there.
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";

const { PublicKey, SystemProgram } = anchor.web3;

// Mirrors programs/attention_fi/src/features.rs.
const FEATURES: Record<string, number> = {
  dutch: 1 << 0,
  conviction: 1 << 1,
  revenue: 1 << 2,
  nft: 1 << 3,
  perks: 1 << 4,
};

function describe(mask: number): string {
  const names = Object.entries(FEATURES)
    .filter(([, bit]) => mask & bit)
    .map(([name]) => name);
  return names.length ? names.join(", ") : "(none — everything enabled)";
}

async function main() {
  const names = process.argv.slice(2).map((n) => n.toLowerCase());
  const unknown = names.filter((n) => !(n in FEATURES));
  if (unknown.length) {
    throw new Error(
      `unknown feature(s): ${unknown.join(", ")}. Known: ${Object.keys(FEATURES).join(", ")}`,
    );
  }
  const disabled = names.reduce((mask, n) => mask | FEATURES[n]!, 0);

  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const authority = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId,
  );
  const [gatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("featuregate")],
    program.programId,
  );

  const global = await program.account.global.fetchNullable(globalPda);
  if (!global) throw new Error("Global is not initialized — run initialize first.");
  if (global.authority.toBase58() !== authority.toBase58()) {
    throw new Error(
      `only the protocol authority may set the gate (authority is ${global.authority.toBase58()})`,
    );
  }

  const before = await program.account.featureGate.fetchNullable(gatePda);
  const sig = await program.methods
    .setFeatureGate(disabled)
    .accountsStrict({
      authority,
      global: globalPda,
      featureGate: gatePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  const after = await program.account.featureGate.fetch(gatePda, "confirmed");
  console.log(before ? "FeatureGate updated" : "FeatureGate created", `(${gatePda.toBase58()})`);
  console.log("  before  :", before ? describe(before.disabled) : "(no gate — everything enabled)");
  console.log("  disabled:", describe(after.disabled));
  console.log("  tx      :", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
