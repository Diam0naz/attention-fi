/**
 * Configure the dedicated SAS attestation issuer (IssuerConfig PDA), gated by
 * Global.authority. Idempotent: safe to re-run to rotate the issuer key.
 *
 * Usage: npx ts-node scripts/set-issuer.ts <issuer-pubkey>
 * (uses ANCHOR_PROVIDER_URL + the wallet at ~/.config/solana/id.json, which
 * must be Global.authority — see `solana program show <program-id>` / the
 * Global account's `authority` field).
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import * as fs from "fs";
import * as os from "os";

const { PublicKey, Keypair, Connection } = anchor.web3;

async function main() {
  const issuerArg = process.argv[2];
  if (!issuerArg) {
    console.error("Usage: npx ts-node scripts/set-issuer.ts <issuer-pubkey>");
    process.exit(1);
  }
  const issuer = new PublicKey(issuerArg);

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

  const [issuerConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("issuer")],
    program.programId,
  );

  console.log(`Authority     : ${authority.publicKey.toBase58()}`);
  console.log(`IssuerConfig  : ${issuerConfigPda.toBase58()}`);
  console.log(`New issuer    : ${issuer.toBase58()}`);
  console.log("Sending setIssuer...");

  const sig = await program.methods
    .setIssuer(issuer)
    .accounts({ authority: authority.publicKey })
    .rpc();

  console.log(`Done. tx: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
