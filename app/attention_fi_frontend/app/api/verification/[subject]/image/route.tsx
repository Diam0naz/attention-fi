/**
 * The verification badge artwork, rendered as PNG.
 *
 * PNG rather than SVG for the same reason as the perk/genesis card: Phantom
 * and Solflare proxy NFT images and refuse `image/svg+xml`, so the badge was
 * fetched and dropped. See app/api/nft/[class]/[asset]/image/route.tsx.
 */
import { ImageResponse } from "next/og";
import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID } from "@/lib/solana/config";
import { getSkinWithUri } from "@/lib/skin-db";
import { CUSTOM_SKIN_ID, skinById } from "@/lib/nft-skins";

const VERIFY_SEED = Buffer.from("verify");

export const revalidate = 60;

const SIZE = 600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subject: string }> },
) {
  const { subject } = await params;

  let subjectKey: PublicKey;
  try {
    subjectKey = new PublicKey(subject);
  } catch {
    return new Response("invalid subject", { status: 400 });
  }

  const [verificationPda] = PublicKey.findProgramAddressSync(
    [VERIFY_SEED, subjectKey.toBuffer()],
    PROGRAM_ID,
  );

  let handle: string;
  try {
    const program = getReadonlyProgram();
    handle = (await program.account.verification.fetch(verificationPda)).handle;
  } catch {
    return new Response("not verified", { status: 404 });
  }

  const sel = await getSkinWithUri(subject).catch(() => ({ skin: null, customUri: null }));
  // Signature is the holder's own artwork, so there's nothing to draw. Redirect
  // rather than proxy: we never fetch a holder-supplied URL server-side, and a
  // redirect keeps that true for anything hitting this route directly.
  if (sel.skin === CUSTOM_SKIN_ID && sel.customUri) {
    return Response.redirect(sel.customUri, 302);
  }
  const skin = skinById(sel.skin);
  // Long handles would overflow the card; scale the type down instead of
  // clipping, so the badge stays legible rather than truncated.
  const label = `@${handle}`;
  const fontSize = label.length > 16 ? 34 : label.length > 12 ? 44 : 56;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          backgroundImage: `linear-gradient(135deg, ${skin.from}, ${skin.to})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            width: SIZE - 40,
            height: SIZE - 40,
            border: `2px solid ${skin.accent}`,
            opacity: 0.35,
            borderRadius: 18,
          }}
        />

        {/* The check, drawn as two rotated bars inside a ring — Satori has no
            path support, so the mark is composed from boxes. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 116,
            height: 116,
            borderRadius: 58,
            border: `4px solid ${skin.accent}`,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 14,
              height: 34,
              borderRadius: 7,
              backgroundColor: skin.accent,
              transform: "rotate(-45deg) translate(-14px, 10px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 14,
              height: 62,
              borderRadius: 7,
              backgroundColor: skin.accent,
              transform: "rotate(35deg) translate(10px, -6px)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 58,
            fontSize,
            fontWeight: 700,
            color: "#F5F4F0",
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 19,
            letterSpacing: 5,
            color: skin.accent,
          }}
        >
          VERIFIED
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 38,
            display: "flex",
            fontSize: 15,
            letterSpacing: 2,
            color: "#6B6B6B",
          }}
        >
          ATTENTIONFI
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
    },
  );
}
