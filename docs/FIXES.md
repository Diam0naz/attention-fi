# Fix log

---

## 2026-08-28 — Mindshare feed: broken launches, wrong design, missing propagation

### What was broken

Bonding-curve launches using the oracle path (`launchFromFeed`) were silently
failing. The console showed:

```
[launch] Started. mech: bonding ticker: HELLO
[launchFromFeed] Started for mint: FDVm…
[launchFromFeed] Building instruction...
[launchFromFeed] Instruction built.
[launchFromFeed] Loading Switchboard...
[launchFromFeed] Fetching update ix for feed...
```

…and then nothing. The transaction was never built or sent.

### Root cause

Three separate problems, all in the mindshare feed layer:

**1. Wrong architectural design — one global feed for all handles**

`NEXT_PUBLIC_MINDSHARE_FEED` pointed at a single Switchboard feed pubkey that
was hardcoded for one handle. The frontend passed that same feed account to
every `launchFromFeed` call regardless of whose token was being launched. This
meant every token got its tier from the wrong handle's oracle data.

More critically: if that feed had no fresh oracle response (which it won't on
devnet unless actively cranked), `fetchUpdateIx` returns `numSuccess = 0` and
the original code threw an error with no fallback — breaking all bonding-curve
launches entirely.

**2. No fallback when the oracle was unavailable**

The original `launchFromFeed` either succeeded via the oracle path or threw.
There was no fallback to the keeper-tier `launchToken` path. A feed that was
stale, misconfigured, or simply absent for a handle caused the entire launch to
fail rather than gracefully degrading.

**3. The on-chain mindshare crank also used a global feed**

`refreshOnchainMindshare` (in `mindshare-oracle.ts`) and the `OnchainMindshare`
component (on the trading page) both used `mindshareFeedPubkey()` — the single
global feed. This meant the "Record it on-chain" crank button on the token page
would write the wrong handle's data into the `MindshareState` PDA, and would
show a misleading "no feed configured" message that didn't name the handle it
was referring to.

---

### What was fixed

#### `lib/solana/mindshare-feed.ts` — full rewrite

- **Per-handle feed lookup** via `feedForHandle(handle)`. Precedence:
  1. `NEXT_PUBLIC_MINDSHARE_FEEDS` — new env var, a JSON map of
     `{ "handle": "feedPubkey" }`, one entry per handle that has had a
     Switchboard feed provisioned for it.
  2. `NEXT_PUBLIC_MINDSHARE_FEED` — kept as a global fallback for backward
     compatibility.
  3. `null` — no feed for this handle; use the keeper path.

- **`launchFromFeed` now takes `handle` and `tierArg`** as additional
  parameters and returns `LaunchResult = { path: "oracle" | "keeper", sig }`.

- **Graceful fallback on all oracle failures**. If no feed is configured, if
  `fetchUpdateIx` throws, or if `numSuccess < 1`, the function falls back to
  `keeperLaunch` (a plain `launchToken` legacy transaction) instead of
  throwing. Launches never fail because of a missing or stale oracle.

- **New exports**: `feedForHandle`, `feedEnabledForHandle`, `LaunchResult`.
  `mindshareFeedPubkey` and `mindshareFeedEnabled` are retained for any
  consumers that need the global-level check.

#### `components/launch/launch-flow.tsx`

- `feedActive` is now `feedEnabledForHandle(handle)` — per-handle, not global.
  The oracle badge only shows when a feed is actually configured for the handle
  being launched.

- The bonding-curve launch branch now calls
  `launchFromFeed(program, mint, metadataArg, tierArg, handle)`. The old
  parallel `launchToken` call sitting next to it is removed; the fallback is
  inside `launchFromFeed` itself.

- **Seed & review step** shows two distinct UI states:
  - Oracle badge (signal colour) when a feed is configured for the handle.
  - Keeper badge (grey) when there is no feed — tells the user exactly which
    path will be used rather than hiding it.

- **Confirm step** states which path will be used (`"Tier derived on-chain from
  the oracle"` vs `"Tier from mindshare API (keeper path)"`).

#### `lib/solana/mindshare-oracle.ts`

- `refreshOnchainMindshare` now accepts a `handle: string` third parameter and
  uses `feedForHandle(handle)` instead of `mindshareFeedPubkey()`. The error
  message when no feed is found names both env vars so it's actionable.

#### `components/token/onchain-mindshare.tsx`

- Component now accepts `handle: string` alongside `mint`. Both the feed check
  (`feedEnabledForHandle`) and the crank call (`refreshOnchainMindshare`) use
  the handle, so the correct per-handle feed is used.

- The "no feed configured" message now names the specific handle:
  `"No feed configured for @<handle> on this deployment"` and references
  `NEXT_PUBLIC_MINDSHARE_FEEDS` (the new var) instead of the old singular one.

#### `components/token/token-detail.tsx`

- `<OnchainMindshare>` now receives `handle={token.handle}` to satisfy the
  updated component signature.

#### `.env.example`

- Documents `NEXT_PUBLIC_MINDSHARE_FEEDS` with an example, explanation of the
  fallback chain, and a note that both vars being blank is valid and never
  breaks launches.

---

### Current behaviour by environment

| Env vars set | Launch path | On-chain crank |
|---|---|---|
| Both blank (dev/test) | Keeper tier for all handles | Crank button hidden ("no feed") |
| `NEXT_PUBLIC_MINDSHARE_FEEDS={"handle":"pubkey"}` | Oracle for named handles, keeper for all others | Crank works for named handles |
| `NEXT_PUBLIC_MINDSHARE_FEED=<pubkey>` (global fallback) | Oracle for all (one feed) | Crank works for all handles |
| Both set | Per-handle oracle, global fallback for unlisted, keeper if oracle fails | Per-handle feed used |

The keeper path uses the same mindshare tier the oracle would — it reads the
`/api/mindshare` endpoint and passes the result as an argument to `launchToken`.
The only difference is the oracle path derives the tier trustlessly on-chain,
which matters for anti-manipulation in production but is irrelevant during
development.

---

### Files changed

```
app/attention_fi_frontend/lib/solana/mindshare-feed.ts        rewritten
app/attention_fi_frontend/lib/solana/mindshare-oracle.ts      refreshOnchainMindshare signature + feed lookup
app/attention_fi_frontend/components/launch/launch-flow.tsx   feedActive, launch branch, UI badges
app/attention_fi_frontend/components/token/onchain-mindshare.tsx  handle prop, feed check, crank, message
app/attention_fi_frontend/components/token/token-detail.tsx   pass handle to OnchainMindshare
app/attention_fi_frontend/.env.example                        NEXT_PUBLIC_MINDSHARE_FEEDS documented
```

TypeScript check: `npx tsc --noEmit` passes with zero errors after all changes.

---

### When to enable the oracle path

Leave both env vars blank for dev/test. Enable in production only after:

1. The app is publicly reachable at a stable URL (Switchboard's oracle nodes
   must be able to GET `/api/mindshare?handle=<handle>` from the internet).
2. You have run `scripts/create-feed.ts <handle>` for each handle you want
   oracle-backed, and recorded the printed feed pubkeys.
3. You populate `NEXT_PUBLIC_MINDSHARE_FEEDS` with those pubkeys and redeploy.

A per-handle feed is not required for every handle — unlisted handles
automatically use the keeper path, which produces the same tier from the same
data source.
