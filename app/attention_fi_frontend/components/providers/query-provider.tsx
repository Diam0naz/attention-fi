"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Shared query cache for the main app.
 *
 * The terminal has carried its own client for a while; everything outside it
 * hand-rolled the same pattern per component — a nonce to force refetches, a
 * cancelled flag, a focus listener. The cost wasn't the boilerplate, it was
 * that four surfaces read the same wallet portfolio independently and could
 * each hold a different answer at the same moment. One cache makes that a
 * single source of truth, and lets a transaction invalidate every reader at
 * once.
 *
 * Created in state rather than at module scope: a module-level client is
 * shared across requests on the server, which would leak one user's data into
 * another's render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are the expensive part; a few seconds of sharing
            // between components collapses the duplicate fetches without
            // making the UI feel stale.
            staleTime: 10_000,
            // Credentials are minted on other screens and in other tabs, so
            // coming back to the app should re-read. This replaces the focus
            // listeners that were written by hand in several components.
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
