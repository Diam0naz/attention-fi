/**
 * Metaplex-standard metadata for a verification NFT.
 *
 * This is what the asset's on-chain `uri` points at. Because wallets and
 * explorers resolve that uri at read time, changing the row in
 * `verification_skin` restyles the badge everywhere — with no transaction, no
 * update authority, and no program change. The trade-off is that the badge's
 * artwork is only as available as this endpoint.
 *
 * The handle is read from the on-chain `Verification` PDA rather than accepted
 * as a query param, so metadata can't be spoofed by calling this URL with
 * someone else's handle.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID } from "@/lib/solana/config";
import { getSkinWithUri } from "@/lib/skin-db";
import { CUSTOM_SKIN, CUSTOM_SKIN_ID, skinById } from "@/lib/nft-skins";

const VERIFY_SEED = Buffer.from("verify");

/** Cache briefly: a skin change should show up quickly, but wallets can hammer this. */
export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ subject: string }> },
) {
  const { subject } = await params;

  let subjectKey: PublicKey;
  try {
    subjectKey = new PublicKey(subject);
  } catch {
    return NextResponse.json({ error: "invalid subject address" }, { status: 400 });
  }

  const [verificationPda] = PublicKey.findProgramAddressSync(
    [VERIFY_SEED, subjectKey.toBuffer()],
    PROGRAM_ID,
  );

  let handle: string;
  try {
    const program = getReadonlyProgram();
    const account = await program.account.verification.fetch(verificationPda);
    handle = account.handle;
  } catch {
    // No Verification PDA — this wallet was never verified, so there is no
    // badge to describe. 404 rather than a placeholder, so a wallet doesn't
    // render a convincing-looking unverified badge.
    return NextResponse.json({ error: "not verified" }, { status: 404 });
  }

  const sel = await getSkinWithUri(subject).catch(() => ({ skin: null, customUri: null }));
  const origin = new URL(request.url).origin;

  // Signature replaces the generated badge with the holder's own artwork, so
  // metadata points straight at it. Everything else renders through the SVG
  // route. The URL was validated as https on the way in; nothing is fetched
  // server-side, here or anywhere.
  const isCustom = sel.skin === CUSTOM_SKIN_ID && Boolean(sel.customUri);
  const image = isCustom ? sel.customUri! : `${origin}/api/verification/${subject}/image`;
  const skinName = isCustom ? CUSTOM_SKIN.name : skinById(sel.skin).name;

  return NextResponse.json(
    {
      name: `AttentionFi Verified · @${handle}`,
      description:
        `On-chain proof that @${handle} is controlled by ${subject}. ` +
        `Issued by AttentionFi against a Solana Attestation Service attestation.`,
      image,
      external_url: `${origin}/token/${handle}`,
      attributes: [
        { trait_type: "Handle", value: `@${handle}` },
        { trait_type: "Skin", value: skinName },
      ],
      properties: {
        category: "image",
        // A custom image is whatever the holder linked; only our own render is
        // known to be SVG.
        files: [{ uri: image, ...(isCustom ? {} : { type: "image/svg+xml" }) }],
      },
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
