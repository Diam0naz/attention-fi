/**
 * Initialize the AttentionFi `Global` config PDA on the current cluster.
 * Idempotent: exits cleanly if Global already exists.
 *
 * Usage: npx ts-node scripts/init-global.ts   (uses ANCHOR_PROVIDER_URL + the
 * wallet at ~/.config/solana/id.json; treasury defaults to the authority).
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import * as fs from "fs";
import * as os from "os";

const { PublicKey, Keypair, Connection } = anchor.web3;

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;

  const secret = JSON.parse(fs.readFileSync(walletPath, "utf8")) as number[];
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
  const wallet = new anchor.Wallet(authority);
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/attention_fi.json", "utf8"));
  const program = new Program(idl, provider) as Program<AttentionFi>;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId,
  );

  const existing = await connection.getAccountInfo(globalPda);
  if (existing) {
    console.log(`Global already initialized at ${globalPda.toBase58()} — nothing to do.`);
    return;
  }

  console.log(`Authority : ${authority.publicKey.toBase58()}`);
  console.log(`Global PDA: ${globalPda.toBase58()}`);
  console.log("Sending initialize...");

  const sig = await program.methods
    .initialize()
    .accounts({
      authority: authority.publicKey,
      treasury: authority.publicKey, // treasury = authority for now
    })
    .rpc();

  console.log(`Initialized. tx: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
