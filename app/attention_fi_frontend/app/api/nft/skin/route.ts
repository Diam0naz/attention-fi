/**
 * Wear an already-unlocked skin on a perk or genesis NFT.
 *
 * Two things must hold, and they're separate checks:
 *   1. the caller controls the wallet — proven by a signed, timestamped
 *      message, since there's no payment here to stand in for it; and
 *   2. that wallet owns the asset — read from the on-chain PDA, not trusted
 *      from the request.
 *
 * Buying is not handled here. Skins are unlocked once per wallet through
 * /api/verification/skin and then wearable on anything the wallet holds, so
 * this only ever applies an entitlement that already exists.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { applyAssetSkin, getAssetSkin, getOwnedSkins, skinDbConfigured } from "@/lib/skin-db";
import { isSkinClass, readNftFacts } from "@/lib/nft-metadata";
import { DEFAULT_SKIN_ID, isValidSkinId, SKIN_MESSAGE_TTL_MS, skinMessage } from "@/lib/nft-skins";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cls = url.searchParams.get("class");
  const asset = url.searchParams.get("asset");
  const owner = url.searchParams.get("owner");
  if (!cls || !isSkinClass(cls) || !asset) {
    return NextResponse.json({ error: "missing class or asset" }, { status: 400 });
  }
  try {
    const [skin, owned] = await Promise.all([
      getAssetSkin(cls, asset),
      owner ? getOwnedSkins(owner) : Promise.resolve<string[]>([]),
    ]);
    if (!owned.includes(DEFAULT_SKIN_ID)) owned.push(DEFAULT_SKIN_ID);
    return NextResponse.json({ skin, owned });
  } catch {
    return NextResponse.json({ skin: null, owned: [DEFAULT_SKIN_ID] });
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

    let body: {
      class?: unknown;
      asset?: unknown;
      skin?: unknown;
      owner?: unknown;
      messageSignature?: unknown;
      issuedAt?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const { class: cls, asset, skin, owner, messageSignature, issuedAt } = body;

    if (
      typeof cls !== "string" ||
      !isSkinClass(cls) ||
      typeof asset !== "string" ||
      typeof skin !== "string" ||
      typeof owner !== "string" ||
      typeof messageSignature !== "string" ||
      typeof issuedAt !== "number"
    ) {
      return NextResponse.json({ error: "missing or malformed fields" }, { status: 400 });
    }
    if (!isValidSkinId(skin)) {
      return NextResponse.json({ error: "unknown skin" }, { status: 400 });
    }
    if (Math.abs(Date.now() - issuedAt) > SKIN_MESSAGE_TTL_MS) {
      return NextResponse.json({ error: "That request expired — try again." }, { status: 400 });
    }

    let ownerKey: PublicKey;
    try {
      ownerKey = new PublicKey(owner);
    } catch {
      return NextResponse.json({ error: "invalid owner address" }, { status: 400 });
    }

    // (1) control of the wallet. The message binds the asset, so a signature
    // captured for one NFT can't be replayed to restyle another.
    let ok = false;
    try {
      ok = nacl.sign.detached.verify(
        new TextEncoder().encode(skinMessage(asset, skin, issuedAt)),
        bs58.decode(messageSignature),
        ownerKey.toBytes(),
      );
    } catch {
      ok = false;
    }
    if (!ok) return NextResponse.json({ error: "Signature didn't match." }, { status: 403 });

    // (2) ownership of the asset, from the chain rather than the request.
    const facts = await readNftFacts(cls, asset);
    if (!facts) return NextResponse.json({ error: "No such NFT." }, { status: 404 });
    if (facts.owner !== owner) {
      return NextResponse.json({ error: "You don't hold that NFT." }, { status: 403 });
    }

    if (!(await applyAssetSkin(cls, asset, skin, owner))) {
      return NextResponse.json({ error: "You don't own that skin yet." }, { status: 402 });
    }
    return NextResponse.json({ ok: true, skin });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save skin" },
      { status: 500 },
    );
  }
}
