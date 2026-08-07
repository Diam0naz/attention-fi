// Real posts mentioning a handle — the conversation the mindshare score is
// measuring, rather than a description of it.
//
// Uses the same Neynar cast search that lib/farcaster-mindshare.ts already
// pages through for volume; that path reads only `timestamp` and discards the
// text, the author and the engagement counts. Nothing new is called: this is
// the same endpoint asked for one page instead of many.
//
// It replaces invented quotes. The mock composed sentences like "the work
// @handle is shipping is genuinely the most underrated thing in the space" and
// presented them as things people had actually posted, with impression counts
// attached. That is the one kind of placeholder that can't be excused as a
// stand-in — it puts words in real mouths, and a reader has no way to tell.

const SEARCH_URL = "https://api.neynar.com/v2/farcaster/cast/search";
const REQUEST_TIMEOUT_MS = 6_000;
const PAGE_SIZE = 25;

export interface Mention {
  /** Cast hash, for the permalink. */
  id: string;
  text: string;
  author: string;
  authorDisplay: string | null;
  avatar: string | null;
  timestamp: string | null;
  likes: number;
  recasts: number;
  replies: number;
  url: string;
}

interface CastSearchResponse {
  result?: {
    casts?: {
      hash?: string;
      text?: string;
      timestamp?: string;
      author?: { username?: string; display_name?: string; pfp_url?: string };
      reactions?: { likes_count?: number; recasts_count?: number };
      replies?: { count?: number };
    }[];
  };
}

export function mentionsConfigured(): boolean {
  return Boolean(process.env.NEYNAR_API_KEY);
}

const norm = (handle: string) => handle.replace(/^@/, "").toLowerCase();

/**
 * Recent casts mentioning `handle`, newest first.
 *
 * Returns null when no source is configured, which is different from an empty
 * array. "Nobody is talking about this" and "we can't see the conversation"
 * are different facts about a token, and only one of them is about the token.
 */
export async function fetchMentions(handle: string, limit = 6): Promise<Mention[] | null> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return null;

  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", norm(handle));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("sort_type", "desc_chron");

  let body: CastSearchResponse;
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    body = (await res.json()) as CastSearchResponse;
  } catch {
    return null;
  }

  const casts = body.result?.casts ?? [];
  const out: Mention[] = [];
  for (const c of casts) {
    const text = c.text?.trim();
    // A cast that matched on something other than its visible text has nothing
    // to show, and rendering an empty quote block looks like a rendering bug.
    if (!text || !c.hash) continue;
    const author = c.author?.username ?? "unknown";
    out.push({
      id: c.hash,
      text,
      author,
      authorDisplay: c.author?.display_name ?? null,
      avatar: c.author?.pfp_url ?? null,
      timestamp: c.timestamp ?? null,
      likes: c.reactions?.likes_count ?? 0,
      recasts: c.reactions?.recasts_count ?? 0,
      replies: c.replies?.count ?? 0,
      // Warpcast resolves a short hash against the author, which is all the
      // search gives us.
      url: `https://warpcast.com/${author}/${c.hash.slice(0, 10)}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}
