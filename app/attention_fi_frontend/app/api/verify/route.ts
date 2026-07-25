import { PublicKey } from "@solana/web3.js";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { deriveAttestationPda, fetchMaybeAttestation, getCreateAttestationInstruction } from "sas-lib";
import nacl from "tweetnacl";
import { NextResponse } from "next/server";
import { decodeHandleData, encodeHandleData, MAX_HANDLE_LEN, SAS_ATTESTATION_TTL_S, verifyMessage } from "@/lib/sas/config";

export const dynamic = "force-dynamic";

interface VerifyRequest {
  handle: string;
  wallet: string;
  /** base64 signature over `verifyMessage(handle, wallet)`, from the wallet's signMessage. */
  signature: string;
}

function rpcUrls() {
  const http = process.env.SAS_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
  const ws = http.replace(/^http/, "ws");
  return { http, ws };
}

/** Retry a flaky RPC call a few times with a per-attempt timeout, so an
 *  intermittent ETIMEDOUT doesn't sink the whole request. Devnet RPCs
 *  (even keyed ones) drop connections often enough that a single attempt is
 *  unreliable. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, timeoutMs = 7000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RPC timed out")), timeoutMs)),
      ]);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Lazily built so a misconfigured env fails a request, not the route's module load. */
function issuerSecretKeyBytes(): Uint8Array {
  const raw = process.env.SAS_ISSUER_SECRET_KEY;
  if (!raw) throw new Error("SAS_ISSUER_SECRET_KEY is not configured");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error("SAS_ISSUER_SECRET_KEY must be a 64-byte solana-keygen JSON array");
  }
  return Uint8Array.from(parsed as number[]);
}

export async function POST(req: Request) {
  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { handle, wallet, signature } = body;
  if (typeof handle !== "string" || handle.length === 0 || handle.length > MAX_HANDLE_LEN) {
    return NextResponse.json({ error: "invalid handle" }, { status: 400 });
  }
  if (typeof wallet !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "missing wallet or signature" }, { status: 400 });
  }

  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
  }

  // The message is reconstructed server-side (never trusted from the client)
  // so it always matches exactly what VerifyHandleFlow displayed for signing.
  const message = new TextEncoder().encode(verifyMessage(handle, wallet));
  const signatureBytes = Buffer.from(signature, "base64");
  const validSignature =
    signatureBytes.length === 64 &&
    nacl.sign.detached.verify(message, signatureBytes, walletPubkey.toBytes());
  if (!validSignature) {
    return NextResponse.json({ error: "signature does not match wallet" }, { status: 401 });
  }

  const credentialEnv = process.env.SAS_CREDENTIAL_ADDRESS;
  const schemaEnv = process.env.SAS_SCHEMA_ADDRESS;
  if (!credentialEnv || !schemaEnv) {
    return NextResponse.json(
      { error: "SAS not configured — run scripts/sas-setup.ts first" },
      { status: 503 },
    );
  }

  try {
    const issuer = await createKeyPairSignerFromBytes(issuerSecretKeyBytes());
    const credential = address(credentialEnv);
    const schema = address(schemaEnv);
    const nonce = address(wallet);
    const [attestation] = await deriveAttestationPda({ credential, schema, nonce });

    const { http, ws } = rpcUrls();
    const rpc = createSolanaRpc(http);

    // Idempotent: the attestation PDA is deterministic in (credential, schema,
    // nonce=wallet), so it can only be created once. If a prior verify already
    // created it (e.g. the on-chain verifyHandle step failed and the user
    // retried), don't try to recreate it — that fails simulation with "account
    // already in use" and 500s. Return the existing one so the flow proceeds.
    let existing: Awaited<ReturnType<typeof fetchMaybeAttestation>>;
    try {
      existing = await withRetry(() => fetchMaybeAttestation(rpc, attestation));
    } catch (e) {
      console.error("[/api/verify] existence check failed after retries:", e);
      return NextResponse.json(
        {
          error:
            "Couldn't reach Solana to check your verification status — a transient RPC hiccup. Please try again in a moment.",
        },
        { status: 503 },
      );
    }
    if (existing.exists) {
      // An attestation is one-per-wallet (PDA keyed by nonce=wallet). If it's
      // already bound to a DIFFERENT handle, returning it would make the
      // on-chain verifyHandle fail its handle-binding check with a cryptic
      // InvalidHandle — surface the real situation instead.
      const boundHandle = decodeHandleData(Uint8Array.from(existing.data.data));
      if (boundHandle && boundHandle !== handle) {
        return NextResponse.json(
          {
            error: `This wallet is already verified as @${boundHandle}. Use @${boundHandle} to continue, or connect a different wallet.`,
            boundHandle,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ attestation: attestation.toString(), existing: true });
    }

    const expiry = BigInt(Math.floor(Date.now() / 1000) + SAS_ATTESTATION_TTL_S);
    const instruction = getCreateAttestationInstruction({
      payer: issuer,
      authority: issuer,
      credential,
      schema,
      attestation,
      nonce,
      data: encodeHandleData(handle),
      expiry,
    });

    const rpcSubscriptions = createSolanaRpcSubscriptions(ws);
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

    const { value: latestBlockhash } = await withRetry(() => rpc.getLatestBlockhash().send());
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(issuer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstructions([instruction], m),
    );
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    assertIsTransactionWithBlockhashLifetime(signedTransaction);
    await sendAndConfirm(signedTransaction, { commitment: "confirmed" });
    const txSignature = getSignatureFromTransaction(signedTransaction);

    return NextResponse.json({ attestation: attestation.toString(), signature: txSignature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "attestation creation failed";
    // Surface the real cause server-side — the JSON body alone is easy to miss.
    console.error("[/api/verify] attestation creation failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
