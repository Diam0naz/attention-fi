/**
 * Hand protocol authority (Global.authority) to a different wallet.
 *
 * The program requires BOTH the current and the incoming authority to sign, so
 * authority can't be sent to a mistyped address nobody controls. That means a
 * browser alone can't perform a handover — the console shows the current
 * authority but this is the tool that changes it.
 *
 * Two modes:
 *
 *   Both keys on disk — signs and sends in one go:
 *     npx tsx scripts/set-authority.ts --new-keypair ./operator.json
 *
 *   Incoming key elsewhere (a hardware or browser wallet) — signs as the
 *   current authority and prints a partially-signed transaction for the other
 *   party to countersign and submit:
 *     npx tsx scripts/set-authority.ts --new <pubkey>
 *
 * The current authority defaults to ~/.config/solana/id.json (override with
 * ANCHOR_WALLET); the cluster to devnet (override with ANCHOR_PROVIDER_URL).
 *
 * Recommended path for separating the deploy key from the operator key:
 *   solana-keygen new -o operator.json      # fresh key, never the deploy key
 *   npx tsx scripts/set-authority.ts --new-keypair ./operator.json
 *   # then import operator.json into Phantom and run /admin from it
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import type { AttentionFi } from "../target/types/attention_fi";
import * as fs from "fs";
import * as os from "os";

const { PublicKey, Keypair, Connection, Transaction } = anchor.web3;

function loadKeypair(path: string) {
  const secret = JSON.parse(fs.readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}\n`);
  console.error("Usage:");
  console.error("  npx tsx scripts/set-authority.ts --new-keypair <path.json>");
  console.error("  npx tsx scripts/set-authority.ts --new <pubkey>");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const keypairArg = args.includes("--new-keypair")
    ? args[args.indexOf("--new-keypair") + 1]
    : undefined;
  const pubkeyArg = args.includes("--new") ? args[args.indexOf("--new") + 1] : undefined;

  if (!keypairArg && !pubkeyArg) usage("pass --new-keypair <path> or --new <pubkey>");
  if (keypairArg && pubkeyArg) usage("pass only one of --new-keypair / --new");

  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;

  const authority = loadKeypair(walletPath);
  const incomingKp = keypairArg ? loadKeypair(keypairArg) : null;
  const incoming = incomingKp ? incomingKp.publicKey : new PublicKey(pubkeyArg!);

  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/attention_fi.json", "utf8"));
  const program = new Program(idl, provider) as Program<AttentionFi>;

  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], program.programId);
  const global = await program.account.global.fetch(globalPda);

  console.log(`Cluster        : ${rpc}`);
  console.log(`Global         : ${globalPda.toBase58()}`);
  console.log(`Current        : ${global.authority.toBase58()}`);
  console.log(`Incoming       : ${incoming.toBase58()}`);

  // Fail here rather than letting the program reject it after a round trip —
  // the most likely cause is pointing ANCHOR_WALLET at the wrong key.
  if (global.authority.toBase58() !== authority.publicKey.toBase58()) {
    console.error(
      `\nerror: ${walletPath} is ${authority.publicKey.toBase58()}, which is not the ` +
        `current authority. Set ANCHOR_WALLET to the authority's keypair.`,
    );
    process.exit(1);
  }
  if (global.authority.toBase58() === incoming.toBase58()) {
    console.error("\nerror: that wallet is already the authority — nothing to do.");
    process.exit(1);
  }

  const ix = await program.methods
    .setAuthority()
    .accountsPartial({ authority: authority.publicKey, newAuthority: incoming })
    .instruction();

  if (incomingKp) {
    const sig = await provider.sendAndConfirm!(new Transaction().add(ix), [incomingKp]);
    console.log(`\nAuthority transferred. Signature: ${sig}`);
    console.log("Re-run `solana program show` or open /admin from the new wallet to confirm.");
    return;
  }

  // Partial-sign path: everything except the incoming wallet's signature.
  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.partialSign(authority);

  const b64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  console.log("\nPartially signed — the incoming wallet must countersign and submit.");
  console.log("This transaction is only valid for a couple of minutes (blockhash expiry).\n");
  console.log(b64);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
