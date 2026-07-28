import type { MetadataRoute } from "next";

/**
 * Keep pre-launch deployments out of search results.
 *
 * The mindshare oracle forces the app to be reachable from the public internet
 * (Switchboard's oracles fetch /api/mindshare themselves), but reachable is not
 * the same as launched. Until NEXT_PUBLIC_ALLOW_INDEXING is set to "true",
 * every crawler is disallowed, so an unlisted preview URL stays unlisted.
 */
export default function robots(): MetadataRoute.Robots {
  const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
  return {
    rules: allowIndexing
      ? // /admin stays disallowed even after launch — it's unlinked, and
        // listing it in search would be the one thing that surfaces it.
        { userAgent: "*", allow: "/", disallow: "/admin" }
      : { userAgent: "*", disallow: "/" },
  };
}
