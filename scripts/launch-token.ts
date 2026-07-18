/**
 * Launch a bonding-curve token on the current cluster.
 * Usage: npx ts-node scripts/launch-token.ts [NewEntrant|Emerging|Top100|Top10]
 * (uses ANCHOR_PROVIDER_URL + the wallet at ~/.config/solana/id.json).
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import * as fs from "fs";
import * as os from "os";

const { PublicKey, Keypair, Connection } = anchor.web3;

const TIERS: Record<string, object> = {
  NewEntrant: { newEntrant: {} },
  Emerging: { emerging: {} },
  Top100: { top100: {} },
  Top10: { top10: {} },
};

async function main() {
  const tierName = process.argv[2] ?? "Top100";
  const tier = TIERS[tierName];
  if (!tier) throw new Error(`unknown tier ${tierName}`);

  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
  const creator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const provider = new anchor.AnchorProvider(new Connection(rpc, "confirmed"), new anchor.Wallet(creator), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync("target/idl/attention_fi.json", "utf8"));
  const program = new Program(idl, provider) as Program<AttentionFi>;

  const mint = Keypair.generate();
  console.log(`Launching ${tierName} — mint ${mint.publicKey.toBase58()}`);

  const sig = await program.methods
    .launchToken(tier as never)
    .accounts({ creator: creator.publicKey, mint: mint.publicKey })
    .signers([mint])
    .rpc();
  console.log(`tx: ${sig}`);

  const [curve] = PublicKey.findProgramAddressSync([Buffer.from("curve"), mint.publicKey.toBuffer()], program.programId);
  const c = await program.account.bondingCurve.fetch(curve);
  console.log(`curve ${curve.toBase58()}`);
  console.log(`  virtual_sol   : ${c.virtualSolReserves.toString()}`);
  console.log(`  virtual_token : ${c.virtualTokenReserves.toString()}`);
  console.log(`  tier ${c.tier}  complete ${c.complete}`);
  console.log(`MINT=${mint.publicKey.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
