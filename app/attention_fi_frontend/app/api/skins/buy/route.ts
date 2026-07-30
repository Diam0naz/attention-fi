/**
 * Unlock a skin for a wallet, by payment.
 *
 * Deliberately separate from applying one. Unlocking is wallet-level: it isn't
 * tied to a verification badge, and the holder decides afterwards which NFT
 * wears it. Folding purchase into /api/verification/skin meant only verified
 * wallets could ever unlock anything, which left the perk and genesis pickers
 * permanently locked with nothing a holder could do about it.
 *
 * Authorisation is the payment itself: you can't pay from a wallet you don't
 * control, so the transfer proves ownership as well as a signed message would,
 * and collects the fee in the same step. The signature is consumed atomically,
 * so one payment unlocks exactly one skin and a replay does nothing.
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID, RPC_ENDPOINT } from "@/lib/solana/config";
import { redeemSkinUnlock, skinDbConfigured } from "@/lib/skin-db";
import { CUSTOM_SKIN_ID, isValidSkinId, SKIN_FEE_LAMPORTS } from "@/lib/nft-skins";

const GLOBAL_SEED = Buffer.from("global");

/** Small tolerance so a fee tweak mid-flight doesn't reject an honest payment. */
const FEE_TOLERANCE_LAMPORTS = 1_000;

export async function POST(request: Request) {
  try {
    if (!skinDbConfigured()) {
      return NextResponse.json(
        { error: "Skins aren't configured on this deployment." },
        { status: 503 },
      );
    }

    let body: { owner?: unknown; skin?: unknown; signature?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const { owner, skin, signature } = body;

    if (typeof owner !== "string" || typeof skin !== "string" || typeof signature !== "string") {
      return NextResponse.json({ error: "missing owner, skin or signature" }, { status: 400 });
    }
    if (!isValidSkinId(skin)) {
      return NextResponse.json({ error: "unknown skin" }, { status: 400 });
    }
    // Signature is earned by owning the rest; selling it defeats the point.
    if (skin === CUSTOM_SKIN_ID) {
      return NextResponse.json(
        { error: "Signature can't be bought — it unlocks by owning every other skin." },
        { status: 400 },
      );
    }

    let ownerKey: PublicKey;
    try {
      ownerKey = new PublicKey(owner);
    } catch {
      return NextResponse.json({ error: "invalid owner address" }, { status: 400 });
    }

    const program = getReadonlyProgram();
    const [globalPda] = PublicKey.findProgramAddressSync([GLOBAL_SEED], PROGRAM_ID);
    const treasury = (await program.account.global.fetch(globalPda)).treasury as PublicKey;

    // Read at "confirmed" so a just-sent transfer is visible without waiting
    // for finality.
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) {
      return NextResponse.json({ error: "Payment not found or failed on-chain." }, { status: 402 });
    }

    // Compare the treasury's balance before/after rather than decoding
    // instructions: it holds however the transfer was built, and can't be
    // spoofed by a transaction that merely mentions the treasury.
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
    });
    const idx = keys.staticAccountKeys.findIndex((k) => k.equals(treasury));
    if (idx === -1 || !tx.meta) {
      return NextResponse.json({ error: "Payment didn't reach the treasury." }, { status: 402 });
    }
    const received =
      BigInt(tx.meta.postBalances[idx] ?? 0) - BigInt(tx.meta.preBalances[idx] ?? 0);
    if (received < BigInt(SKIN_FEE_LAMPORTS - FEE_TOLERANCE_LAMPORTS)) {
      return NextResponse.json({ error: "Payment was below the skin fee." }, { status: 402 });
    }

    // The fee payer is the first signer; requiring it to be the buyer is what
    // makes the payment double as proof of wallet control.
    if (!keys.staticAccountKeys[0]?.equals(ownerKey)) {
      return NextResponse.json(
        { error: "Payment must come from the wallet unlocking the skin." },
        { status: 403 },
      );
    }

    if (!(await redeemSkinUnlock(owner, skin, signature))) {
      return NextResponse.json({ error: "That payment has already been used." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, skin });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not unlock skin" },
      { status: 500 },
    );
  }
}
