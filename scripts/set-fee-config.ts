/**
 * Create or update the NFT market's fee schedule.
 *
 * `initialize` creates a `FeeConfig` for every new deployment, so this exists
 * for the one that came before it did: the account is mandatory wherever those
 * fees are charged, which means `buy_nft`, `buy_collection`, `buy_genesis_unit`
 * and `promote_listing` cannot run on an older protocol until this has been
 * called once. Run it immediately after the redeploy that introduces FeeConfig.
 *
 * Safe to re-run: omitted values keep whatever is stored, so calling it twice
 * changes nothing.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   npx ts-node scripts/set-fee-config.ts [nftFeeBps] [promoLamportsPerDay]
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";

const { PublicKey, SystemProgram } = anchor.web3;

/** An optional numeric argument: absent leaves the stored value alone. */
function optional(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`not a number: ${raw}`);
  return value;
}

async function main() {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const authority = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId,
  );
  const [feeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feeconfig")],
    program.programId,
  );

  const global = await program.account.global.fetchNullable(globalPda);
  if (!global) throw new Error("Global is not initialized — run initialize first.");
  if (global.authority.toBase58() !== authority.toBase58()) {
    throw new Error(
      `only the protocol authority may set fees (authority is ${global.authority.toBase58()})`,
    );
  }

  const nftFeeBps = optional(process.argv[2]);
  const promo = optional(process.argv[3]);

  const before = await program.account.feeConfig.fetchNullable(feeConfigPda);
  const sig = await program.methods
    .setFeeConfig(nftFeeBps, promo === null ? null : new anchor.BN(promo))
    .accountsStrict({
      authority,
      global: globalPda,
      feeConfig: feeConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const after = await program.account.feeConfig.fetch(feeConfigPda);
  console.log(before ? "FeeConfig updated" : "FeeConfig created", `(${feeConfigPda.toBase58()})`);
  console.log("  nft_fee_bps           :", after.nftFeeBps);
  console.log("  promo_lamports_per_day:", after.promoLamportsPerDay.toString());
  console.log("  signature             :", sig);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
