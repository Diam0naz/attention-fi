/**
 * Set the skin on a caller's own verification NFT.
 *
 * Authorisation is a wallet signature, not a session: the caller signs a
 * message naming the subject and skin, and the server reconstructs that exact
 * message before verifying. Without this, the endpoint would let anyone
 * restyle anyone else's badge, since the subject is just an address.
 *
 * Deliberately does NOT require the on-chain update authority — that is the
 * whole point of pointing the asset's uri at this service. It does require the
 * subject to actually be verified, so unverified wallets can't seed rows.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID } from "@/lib/solana/config";
import { getSkin, putSkin, skinDbConfigured } from "@/lib/skin-db";
import { isValidSkinId, skinMessage } from "@/lib/nft-skins";

const VERIFY_SEED = Buffer.from("verify");

export async function GET(request: Request) {
  const subject = new URL(request.url).searchParams.get("subject");
  if (!subject) return NextResponse.json({ error: "missing subject" }, { status: 400 });
  const skin = await getSkin(subject).catch(() => null);
  return NextResponse.json({ skin });
}

export async function POST(request: Request) {
  if (!skinDbConfigured()) {
    return NextResponse.json(
      { error: "skins are not configured on this deployment" },
      { status: 503 },
    );
  }

  let body: { subject?: unknown; skin?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { subject, skin, signature } = body;

  if (typeof subject !== "string" || typeof skin !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "missing subject, skin or signature" }, { status: 400 });
  }
  // Validate against the catalog before touching the database, so a bad id
  // can't be persisted and later resolve to a broken badge.
  if (!isValidSkinId(skin)) {
    return NextResponse.json({ error: "unknown skin" }, { status: 400 });
  }

  let subjectKey: PublicKey;
  try {
    subjectKey = new PublicKey(subject);
  } catch {
    return NextResponse.json({ error: "invalid subject address" }, { status: 400 });
  }

  // Rebuilt server-side so it always matches what the picker displayed.
  const message = new TextEncoder().encode(skinMessage(subject, skin));
  const signatureBytes = Buffer.from(signature, "base64");
  const validSignature =
    signatureBytes.length === 64 &&
    nacl.sign.detached.verify(message, signatureBytes, subjectKey.toBytes());
  if (!validSignature) {
    return NextResponse.json({ error: "signature does not match subject" }, { status: 401 });
  }

  const [verificationPda] = PublicKey.findProgramAddressSync(
    [VERIFY_SEED, subjectKey.toBuffer()],
    PROGRAM_ID,
  );
  try {
    await getReadonlyProgram().account.verification.fetch(verificationPda);
  } catch {
    return NextResponse.json({ error: "wallet is not verified" }, { status: 403 });
  }

  await putSkin(subject, skin);
  return NextResponse.json({ ok: true, skin });
}
