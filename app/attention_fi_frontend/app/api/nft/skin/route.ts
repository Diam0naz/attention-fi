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
import {
  applyAssetSkin,
  getAssetSkinWithUri,
  getOwnedSkins,
  grantSkin,
  skinDbConfigured,
  isConnectionError,
} from "@/lib/skin-db";
import { isSkinClass, readNftFacts } from "@/lib/nft-metadata";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  CUSTOM_SKIN_ID,
  customSkinUnlocked,
  ownedWithDefault,
  DEFAULT_SKIN_ID,
  isValidSkinId,
  normalizeCustomUri,
  SKIN_MESSAGE_TTL_MS,
  skinMessage,
} from "@/lib/nft-skins";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cls = url.searchParams.get("class");
  const asset = url.searchParams.get("asset");
  const owner = url.searchParams.get("owner");
  if (!cls || !isSkinClass(cls) || !asset) {
    return NextResponse.json({ error: "missing class or asset" }, { status: 400 });
  }
  try {
    const [sel, owned] = await Promise.all([
      getAssetSkinWithUri(cls, asset),
      owner ? getOwnedSkins(owner) : Promise.resolve<string[]>([]),
    ]);
    const held = ownedWithDefault(owned);
    // Derived from the catalogue, never trusted from a row.
    const unlocked = customSkinUnlocked(held);
    if (unlocked && !held.includes(CUSTOM_SKIN_ID)) held.push(CUSTOM_SKIN_ID);
    return NextResponse.json({
      skin: sel.skin,
      customUri: sel.customUri,
      owned: held,
      customUnlocked: unlocked,
    });
  } catch {
    return NextResponse.json({
      skin: null,
      customUri: null,
      owned: [DEFAULT_SKIN_ID],
      customUnlocked: false,
    });
  }
}

export async function POST(request: Request) {
  try {
    // Before the signature check: verifying ed25519 and reading the asset from
    // chain both cost more than turning the request away does.
    const limited = await rateLimit("skins:wear", clientKey(request));
    if (!limited.ok) return tooManyRequests(limited);

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
      customUri?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const { class: cls, asset, skin, owner, messageSignature, issuedAt, customUri } = body;

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

    // Signature is earned, not sold: verify the gate and record the
    // entitlement, so the ownership test inside applyAssetSkin stays a single
    // row lookup for every skin.
    let uri: string | null = null;
    if (skin === CUSTOM_SKIN_ID) {
      const owned = await getOwnedSkins(owner);
      if (!customSkinUnlocked(owned)) {
        return NextResponse.json(
          { error: "Signature unlocks once you own every other skin." },
          { status: 402 },
        );
      }
      if (typeof customUri !== "string" || !(uri = normalizeCustomUri(customUri) ?? "")) {
        return NextResponse.json(
          { error: "Signature needs an https image URL (200 characters or fewer)." },
          { status: 400 },
        );
      }
      await grantSkin(owner, CUSTOM_SKIN_ID);
    }

    if (!(await applyAssetSkin(cls, asset, skin, owner, uri))) {
      return NextResponse.json({ error: "You don't own that skin yet." }, { status: 402 });
    }
    return NextResponse.json({ ok: true, skin });
  } catch (e) {
    // A sleeping database is a wait, not a failed request — say which, rather
    // than surfacing a raw "fetch failed" to whoever clicked.
    if (isConnectionError(e)) {
      return NextResponse.json(
        { error: "The skins database is waking up — try again in a few seconds." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save skin" },
      { status: 500 },
    );
  }
}
