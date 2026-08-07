import { NextResponse, type NextRequest } from "next/server";
import { fetchMentions, mentionsConfigured } from "@/lib/mentions";

export const dynamic = "force-dynamic";
// Cached briefly: the panel polls on navigation and the conversation doesn't
// move on a five-second scale. Keeps a popular token from spending the
// Neynar free-tier budget on identical requests.
export const revalidate = 0;

/**
 * Recent posts mentioning a handle.
 *
 * `configured: false` is deliberately distinct from `mentions: []` so the UI
 * can say "we can't see the conversation" rather than implying nobody is
 * having one.
 */
export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }
  if (!mentionsConfigured()) {
    return NextResponse.json({ configured: false, mentions: [] });
  }

  const mentions = await fetchMentions(handle);
  if (mentions === null) {
    // Configured but the upstream declined — not the same as "no mentions".
    return NextResponse.json({ configured: true, unavailable: true, mentions: [] });
  }
  return NextResponse.json(
    { configured: true, unavailable: false, mentions },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
