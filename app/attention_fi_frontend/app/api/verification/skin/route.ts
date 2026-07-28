/**
 * Set the skin on a caller's own verification NFT.
 *
 * Restyling is a paid protocol service. Authorisation is therefore the payment
 * itself: the caller sends SOL to the treasury and submits the signature, and
 * the server confirms on-chain that the transfer happened, came from the
 * subject, and reached the treasury. That proves wallet control as well as a
 * signed message would — you can't pay from a wallet you don't hold — while
 * also collecting the fee.
 *
 * The signature is consumed atomically (primary key on skin_payment), so one
 * payment buys exactly one change and a replayed signature does nothing.
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID, RPC_ENDPOINT } from "@/lib/solana/config";
import { getSkin, redeemSkinPayment, skinDbConfigured } from "@/lib/skin-db";
import { isValidSkinId, SKIN_FEE_LAMPORTS } from "@/lib/nft-skins";

const VERIFY_SEED = Buffer.from("verify");
const GLOBAL_SEED = Buffer.from("global");

/** Small tolerance so a fee tweak mid-flight doesn't reject an honest payment. */
const FEE_TOLERANCE_LAMPORTS = 1_000;

export async function GET(request: Request) {
  const subject = new URL(request.url).searchParams.get("subject");
  if (!subject) return NextResponse.json({ error: "missing subject" }, { status: 400 });
  try {
    return NextResponse.json({ skin: await getSkin(subject) });
  } catch {
    // A skin lookup failing is not worth failing the page over — the badge
    // renders with the default.
    return NextResponse.json({ skin: null });
  }
}

export async function POST(request: Request) {
  try {
    if (!skinDbConfigured()) {
      return NextResponse.json(
        { error: "Skins aren't configured on this deployment." },
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
    if (!isValidSkinId(skin)) {
      return NextResponse.json({ error: "unknown skin" }, { status: 400 });
    }

    let subjectKey: PublicKey;
    try {
      subjectKey = new PublicKey(subject);
    } catch {
      return NextResponse.json({ error: "invalid subject address" }, { status: 400 });
    }

    // Must actually hold a credential — otherwise there's nothing to restyle.
    const [verificationPda] = PublicKey.findProgramAddressSync(
      [VERIFY_SEED, subjectKey.toBuffer()],
      PROGRAM_ID,
    );
    const program = getReadonlyProgram();
    try {
      await program.account.verification.fetch(verificationPda);
    } catch {
      return NextResponse.json({ error: "This wallet isn't verified." }, { status: 403 });
    }

    const [globalPda] = PublicKey.findProgramAddressSync([GLOBAL_SEED], PROGRAM_ID);
    const treasury = (await program.account.global.fetch(globalPda)).treasury as PublicKey;

    // Confirm the payment on-chain. Read at "confirmed" so a just-sent transfer
    // is visible without waiting for finality.
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) {
      return NextResponse.json(
        { error: "Payment not found or failed on-chain." },
        { status: 402 },
      );
    }

    // Compare treasury balance before/after rather than decoding instructions:
    // it holds regardless of how the transfer was constructed, and can't be
    // spoofed by a transaction that merely mentions the treasury.
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
    });
    const treasuryIndex = keys.staticAccountKeys.findIndex((k) => k.equals(treasury));
    if (treasuryIndex === -1 || !tx.meta) {
      return NextResponse.json({ error: "Payment didn't reach the treasury." }, { status: 402 });
    }
    const received =
      BigInt(tx.meta.postBalances[treasuryIndex] ?? 0) -
      BigInt(tx.meta.preBalances[treasuryIndex] ?? 0);
    if (received < BigInt(SKIN_FEE_LAMPORTS - FEE_TOLERANCE_LAMPORTS)) {
      return NextResponse.json({ error: "Payment was below the skin fee." }, { status: 402 });
    }

    // The fee payer is the first signer; requiring it to be the subject is what
    // makes the payment double as proof of wallet control.
    if (!keys.staticAccountKeys[0]?.equals(subjectKey)) {
      return NextResponse.json(
        { error: "Payment must come from the verified wallet." },
        { status: 403 },
      );
    }

    const applied = await redeemSkinPayment(subject, skin, signature);
    if (!applied) {
      return NextResponse.json(
        { error: "That payment has already been used." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, skin });
  } catch (e) {
    // Anything unhandled here previously escaped as an empty 500 body, which
    // the client then failed to parse as JSON.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save skin" },
      { status: 500 },
    );
  }
}
