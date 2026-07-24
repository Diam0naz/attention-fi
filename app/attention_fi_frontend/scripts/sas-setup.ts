/**
 * One-time setup for the dedicated SAS attestation issuer: creates the
 * Credential (the issuer's on-chain identity) and the Schema (the
 * handle-verification record layout) that /api/verify's createAttestation
 * calls reference afterwards.
 *
 * Usage:
 *   SAS_ISSUER_KEYPAIR_PATH=/path/to/issuer.json \
 *   SAS_RPC_ENDPOINT=https://api.devnet.solana.com \
 *   npx tsx scripts/sas-setup.ts
 *
 * Prints SAS_CREDENTIAL_ADDRESS / SAS_SCHEMA_ADDRESS to paste into .env.
 * Safe to re-run: PDAs are deterministic, so a second run just fails on the
 * "already in use" account creation instead of duplicating state.
 */
import { readFileSync } from "node:fs";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  deriveCredentialPda,
  deriveSchemaPda,
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
} from "sas-lib";

const CREDENTIAL_NAME = "attentionfi";
const SCHEMA_NAME = "handle-verification";
const SCHEMA_VERSION = 1;
/** SchemaDataType::String — the only field, matching /api/verify's encoding. */
const SCHEMA_LAYOUT = Uint8Array.from([12]);
const SCHEMA_FIELD_NAMES = ["handle"];

async function main() {
  const keypairPath = process.env.SAS_ISSUER_KEYPAIR_PATH;
  if (!keypairPath) throw new Error("set SAS_ISSUER_KEYPAIR_PATH to a solana-keygen JSON file");
  const secretKey = Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")) as number[]);
  const issuer = await createKeyPairSignerFromBytes(secretKey);
  console.log("issuer:", issuer.address);

  const httpUrl = process.env.SAS_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
  const rpc = createSolanaRpc(httpUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(httpUrl.replace(/^http/, "ws"));
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  async function send(instructions: Parameters<typeof appendTransactionMessageInstructions>[0]) {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(issuer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    await sendAndConfirm(signed, { commitment: "confirmed" });
  }

  const [credential] = await deriveCredentialPda({
    authority: issuer.address,
    name: CREDENTIAL_NAME,
  });
  await send([
    getCreateCredentialInstruction({
      payer: issuer,
      credential,
      authority: issuer,
      name: CREDENTIAL_NAME,
      signers: [issuer.address],
    }),
  ]);
  console.log("credential created:", credential);

  const [schema] = await deriveSchemaPda({
    credential,
    name: SCHEMA_NAME,
    version: SCHEMA_VERSION,
  });
  await send([
    getCreateSchemaInstruction({
      payer: issuer,
      authority: issuer,
      credential,
      schema,
      name: SCHEMA_NAME,
      description: "Binds a verified X handle to a wallet for AttentionFi.",
      layout: SCHEMA_LAYOUT,
      fieldNames: SCHEMA_FIELD_NAMES,
    }),
  ]);
  console.log("schema created:", schema);

  console.log("\nAdd to .env:");
  console.log(`SAS_CREDENTIAL_ADDRESS=${credential}`);
  console.log(`SAS_SCHEMA_ADDRESS=${schema}`);
  console.log(
    "\nThen call the program's set_issuer(issuer.address) from Global.authority so",
    "verify_handle starts trusting this key.",
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
