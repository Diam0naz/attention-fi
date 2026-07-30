/**
 * The verification badge artwork, rendered as SVG.
 *
 * SVG rather than a rasterised OG image so this needs no extra dependency and
 * no font loading — the badge is type and geometry, which SVG does natively.
 * Wallets and explorers accept image/svg+xml for NFT artwork.
 */
import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { PROGRAM_ID } from "@/lib/solana/config";
import { getSkinWithUri } from "@/lib/skin-db";
import { CUSTOM_SKIN_ID, skinById } from "@/lib/nft-skins";

const VERIFY_SEED = Buffer.from("verify");

export const revalidate = 60;

/** Escape text interpolated into SVG — a handle is attacker-influenced input. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${skin.from}"/>
      <stop offset="100%" stop-color="${skin.to}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect x="18" y="18" width="564" height="564" rx="18" fill="none" stroke="${skin.accent}" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="300" cy="212" r="58" fill="none" stroke="${skin.accent}" stroke-width="4"/>
  <path d="M272 212 l20 20 l38 -42" fill="none" stroke="${skin.accent}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="300" y="352" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${fontSize}" font-weight="700" fill="#F5F4F0">${esc(label)}</text>
  <text x="300" y="398" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="19" letter-spacing="5" fill="${skin.accent}">VERIFIED</text>
  <text x="300" y="548" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" fill="#6B6B6B">ATTENTIONFI</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
