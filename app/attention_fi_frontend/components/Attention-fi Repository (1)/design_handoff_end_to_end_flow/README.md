> NOTE for the user: this is a session-fresh writeup — flagging in case any
> detail below needs a correction from you before your dev relies on it.

# Handoff: AttentionFi — Full End-to-End Flow (Production Sequence)

## Overview
This is the complete, finalized app flow for AttentionFi's Phase 0 —
every screen selected as the "best pick per stage" across the whole design
process, in the order they should be built and wired. It supersedes the
narrower `design_handoff_flow_gaps` handoff (which only covered the six
net-new gap screens); this package documents the full trader path, the
parallel creator path, and mobile parity, so a developer can implement the
entire product from one README.

The flow has four stages plus a branch:
1. **Discover** — landing → curated feed → token detail (+ empty states)
2. **Connect & Trade** — wallet connect → verify handle → sign tx → pending/confirmed → failed
3. **Graduate & Manage** — graduation → AMM trading → wallet portfolio → deposit/withdraw → notifications → settings
4. **Creator Path** (branch off the token detail / anywhere) — launch mechanism → attest handle → seed & review → confirm & launch → optional NFT layer (Genesis / Perk / 1-of-1) → gated state

Mobile parity exists for the core trader loop only (landing, curated feed,
token page, launch step 1, AMM swap) — not yet for wallet management,
settings, notifications, or the NFT layer; build those mobile screens by
adapting the desktop layouts to the same 390px bezel pattern used below if/when
that's prioritized.

## About the Design Files
The bundled `Token Trading Page.dc.html` is a **design reference** — an
HTML prototype (built as a series of dated option cards, `#1a`, `#2a`, etc.)
showing intended look, layout, and states across the whole design process.
It is not production code to paste into the app as-is. The screens listed
below are the specific option IDs selected as final for production — ignore
sibling options in the same file that weren't picked (e.g. `1b`, `7a/7b/7c`,
`6b`, `10b/10c/10e/10f` are earlier explorations, superseded by the ones
listed here, and kept in the file only as design history).

The `shipped-components/` folder is a step further along: six of the newest
screens (the ones that closed gaps found in a flow audit) are already
translated into TSX matching this repo's real conventions (Tailwind v4
utility classes, `cn()` from `@/lib/utils`, the `signal`/`noise`/`pulse`
color tokens already defined in `app/globals.css`, `lucide-react` icons,
`"use client"` where there's local state). Treat those six as a strong
first draft to drop into `app/attention_fi_frontend/components/` — not
something to re-implement from HTML, but also not to merge unreviewed.
Every other screen in this flow (landing, feed, token detail, AMM, wallet,
launch flow, NFT layer) still needs to be built from the HTML reference —
it has not been translated to TSX yet.

## Fidelity
**High-fidelity.** Colors, type, and spacing throughout use the repo's real
design tokens — this system was built directly against `app/globals.css`
conventions, not invented separately. No restyling should be needed, just
data wiring and componentization.

## Design Tokens
- `--signal: #00ff85` — primary accent (buy/success/verified/CTAs)
- `--noise: #ff3b5c` — errors, destructive actions, negative deltas
- `--pulse: #5b8fff` — secondary accent (AMM/graduated badge, LP/analytics, links)
- Font sans: `"Space Grotesk"` (headings, body copy, handles)
- Font mono: `"Space Mono"` — all labels, addresses, timestamps, numeric
  data, eyebrows, buttons, and the terminal-style landing copy
- Backgrounds: `#000000` page canvas, `#050805` panel/modal, `#0a0f0a`
  nested inputs/surfaces
- Borders: `rgba(255,255,255,.08)` default hairline, `.06` for subtle
  dividers, `.15`–`.1` for interactive outlines
- Muted text: `#6b6b6b` (labels/eyebrows), `#9aa4af` (secondary body),
  `#f5f4f0` (foreground)
- Radius: **0 (sharp corners) everywhere on desktop.** Mobile screens use a
  390px/36px-radius device bezel (status bar + home indicator) but internal
  UI stays sharp-cornered; pill shapes (999px) are reserved for tag/filter
  chips and progress-style badges only.
- Chart placeholders: green bars `#12332a` fill / `#00ff85` top border for
  up, red `#2e1418` fill / `#ff3b5c` top border for down — swap for a real
  charting lib (e.g. lightweight-charts) using the same up/down palette.

## Screens / Views — in build order

### STAGE 01 · DISCOVER

**1. Landing page — `7d`** ("full terminal": `7b`'s dark mono-forward
type treatment + `7a`'s content structure)
- Purpose: marketing/waitlist page pitching the mindshare-market thesis.
- Layout: full-black canvas, thin `rgba(0,255,133,.12–.15)` hairlines
  between sections instead of the usual white-alpha borders. Nav: wordmark
  `ATTENTIONFI_`, lowercase mono nav links (feed/thesis/mechanism/verticals),
  bracketed `[ JOIN_WAITLIST ]` button, right-aligned.
- Hero: `> pump.fun for x_` eyebrow, 42px mono headline in two lines
  ("attention is the asset." / "trade_it();" in signal green), code-comment
  style subhead (`// every handle on crypto-twitter is a market` etc.),
  two buttons styled as CLI commands (`./join-waitlist`, `./read-thesis`).
- Body sections, each prefixed with a fake shell command as a section
  label (`$ plot mindshare_chart.dat …`, `$ tail -f mindshare_feed.log`,
  `$ cat why_attentionfi.md`): a 7d bar chart, a live-feed log (3 rows,
  handle/mindshare/mktcap/24h, green or red by sign), a 3-up "why us" grid
  (mindshare-seeded price / four launch mechanisms / SAS identity), a 3-up
  stat strip (4 launch mechanisms, 200M+ Kaito posts/day, 0.5% perpetual fee),
  and a closing CLI-style CTA (`$ ./join-waitlist --ref=YOUR_HANDLE` +
  `EXECUTE` button).
- Content/copy is close to final — reuse verbatim unless marketing wants
  changes.
- Mobile parity: `8d` (simplified single-column version, non-terminal
  styling — uses the standard dark-not-black palette, ticker marquee,
  compact feed list, sticky bottom CTA).

**2. Curated feed — `6a`** (editor's pick hero + per-vertical shelves)
- Purpose: main discovery surface — browse tokens by vertical, not just a
  flat table.
- Layout: standard app nav (wordmark, `PHASE 0 · PREVIEW` tag, Feed/Thesis/
  Mechanism/Verticals, right-aligned `CONNECT WALLET`). Below nav: search
  input + horizontally-scrollable pill filter row (ALL/DEFI/AI-TECH/
  ZK-INFRA/GAMING/MUSIC, active pill filled signal-green).
- "Editor's Pick · Today" banner: full-width card, `rgba(0,255,133,.3)`
  border + left-to-right green gradient wash, avatar + handle + verified
  check + `TOP 10` pill, one-line mindshare-move blurb, big mindshare %
  stat on the right, `TRADE` button.
- Below that: per-vertical horizontal shelves (DeFi, AI/Tech, …), each with
  a heading + "curated by mindshare velocity" caption + "SEE ALL →" link,
  then a horizontally-scrolling row of 220px token cards (handle, mindshare
  %, one-line description, a mini gradient bar as a sparkline stand-in).
  Trailing dashed-border cards for "+N more" / "launch here →" CTAs.
- Mobile parity: `8c` (same pill filters + editor's pick + one shelf,
  single-column, cards sized for a 390px viewport).

**3. Token detail / trading page — `1a`** (Trading Terminal — data-dense)
- Purpose: primary trading surface for a bonding-curve token pre-graduation.
- Layout: nav (same pattern as above) → 2-col grid, `1fr` chart/info panel
  + fixed `380px` order panel, divided by a vertical hairline.
- Left panel: graduation-progress banner when close to threshold (green
  card, 🎓 icon, "X% to graduation", `$current / $threshold` mono figure,
  right-aligned) sitting above the token header (avatar, handle + verified
  check + tier badge e.g. `EMERGING`, vertical/category caption, right-
  aligned mindshare % + rank). Below that: big market-cap price line + 24h
  delta. Tab row (CHART / TRADES / HOLDERS / ABOUT, active tab green
  underline). Bar chart (green/red bars per the token palette above).
  Bonding-curve progress bar with "seed $X" / "graduates to AMM at $Y"
  captions.
- Right panel: BUY/SELL toggle (2 buttons, active one filled green), amount
  input card with 25%/50%/MAX quick-select chips, "you receive" + slippage
  rows, full-width BUY button, mechanism caption, then a 2×2 stat grid
  (holders, liquidity, virtual reserves, creator fee w/ verified check).
- Superseded option `1b` ("Mindshare-First") exists in the file but was not
  selected — ignore it.
- Empty/error states for this page's various failure modes (no results
  when filtering, RPC/network failure) come from `12d` below.
- Mobile parity: `8a` (compact single-column: header, price, small bar
  chart, curve-progress bar, sticky BUY/SELL footer).

**4. Empty / filter / error states — `12d`** (cross-cutting, reused on
  Discover and Connect & Trade both)
- Purpose: shared visual language for "nothing to show" (empty feed
  filter) and "something went wrong" (rejected signature, insufficient
  balance, RPC/network failure).
- Layout: standalone card, `rounded-sm border border-white/[0.08]
  bg-[#0f1620] p-5`. Eyebrow label (`font-mono text-[9px]
  tracking-[0.1em]`, `text-[#6B6B6B]` for neutral/empty states,
  `text-noise` for actual errors), bold title, muted description, one
  action — a plain `text-signal` link for low-stakes recovery ("Clear
  filter") or a bordered/filled button for retry actions.
- **Shipped:** `shipped-components/ui/state-card.tsx` → `StateCard`
  (`tone: "neutral"|"error"` + copy + action props). Reuse this one
  component for all four cases (empty feed, rejected signature,
  insufficient balance, RPC failure) rather than four separate components.

### STAGE 02 · CONNECT & TRADE

**5. Wallet-connect picker — `12a`** *(new)*
- Purpose: pick a wallet adapter (Phantom, Solflare, Backpack, Coinbase
  Wallet) to connect.
- Layout: centered modal, 420px wide, `bg-black/70 backdrop-blur-sm`
  overlay, `bg-[#0f1620]` panel, `border border-white/10`, `rounded-sm`.
  Header row (title + close `X`), `border-b border-white/[0.08]`, `px-5
  py-4`. Body: vertical list of wallet rows, `gap-2`, `p-4`.
- Each wallet row: full-width button, `flex items-center gap-3`,
  `bg-[#12181f]`, `border border-white/10`, `rounded-sm`, `px-3.5 py-3`,
  `text-[13px] font-semibold`. 26×26px icon swatch on the left
  (`rounded-sm bg-white/10` placeholder — swap for real wallet logos).
  Detected wallets show a right-aligned `DETECTED` tag
  (`font-mono text-[9px] tracking-[0.08em] text-[#6B6B6B]`).
  Footer: centered "By connecting you accept the Terms of Use"
  (`font-mono text-[10px] text-[#6B6B6B]`).
- **Shipped:** `shipped-components/wallet/wallet-connect-modal.tsx` →
  `WalletConnectModal`. `onSelect(walletId)` should trigger the real
  adapter connect call. Modal closes on backdrop click or `X`.

**6. Verify handle — `12c`** (SAS attestation onboarding) *(new)*
- Purpose: binds an X handle to the connected wallet on-chain, gating
  creator-fee claims. This is the general-purpose "get verified" path —
  distinct from the launch flow's own handle-attest step (`3a`), though
  both use the same SAS mechanism.
- Layout: single card, `rounded-sm border border-white/10 bg-[#0f1620]
  p-5`. Vertical 3-step stepper with a connecting line (`w-px
  bg-white/10`) between step dots.
- Steps: (1) wallet connected — done state, filled green check dot, short
  address; (2) sign to prove @handle — active step shows a quoted
  signature-message preview in a `bg-[#12181f]` mono block + a `SIGN &
  VERIFY` button (`bg-signal text-[#0A0A0A]`); (3) attestation credential
  issued — greyed out until reached, explains the soulbound SAS credential.
- **Shipped:** `shipped-components/onboarding/verify-handle-flow.tsx` →
  `VerifyHandleFlow`, controlled via a `step: 1|2|3` prop. `onSign` should
  trigger the wallet's `signMessage`, then call the SAS attestation
  instruction on success and advance `step` to 3.

**7. Sign transaction — `11d`** (approve overlay)
- Purpose: wallet-style confirmation before any on-chain action
  (buy/sell/swap/deposit/etc).
- Layout: full-screen `rgba(0,0,0,.6)` scrim, centered 420px card,
  `border: 1px solid rgba(0,255,133,.25)`, heavy drop shadow. Header: 22px
  circular "AF" glyph + "Approve transaction" title. Body: `ACTION` eyebrow
  + bold action title (e.g. "Buy $ZKB — bonding curve"), a bordered detail
  card (you send / you receive est. / network fee / program — all
  label-left value-right mono rows), a one-line custody disclaimer, then a
  2-button row: bordered `REJECT` + filled green `APPROVE`.
- Behavior: this is the shared "please sign" moment for every wallet
  instruction in the app (buy, sell, swap, add/remove liquidity, deposit,
  withdraw) — implement once and pass in the action copy + detail rows.

**8. Transaction pending → confirmed / failed — `12b`** *(new)*
- Purpose: feedback after a tx is submitted, before/after chain
  confirmation.
- Layout: a row card, `rounded-sm border p-3.5`, meant to stack (e.g. a
  toast list) or sit inline after signing.
- States: **Pending** — neutral border, spinning `Loader2` icon in
  `text-signal`, "Confirming on Solana…" + tx signature + muted "Solscan ↗"
  link. **Confirmed** — `border-signal/25 bg-signal/[0.04]`, filled green
  check circle, "Transaction confirmed" + active Solscan link. **Failed**
  — `border-noise/30 bg-noise/[0.05]`, filled red X circle, "Transaction
  failed" + reason (e.g. "Slippage tolerance exceeded") + `RETRY` button.
- **Shipped:** `shipped-components/wallet/tx-status.tsx` → `TxStatus`,
  fully controlled (parent owns `state`/`signature`/`detail`). Driven by
  polling or subscribing to tx confirmation — this component is
  presentation-only. `onRetry` re-submits the same instruction.

**9. Rejected / failed transaction — `12d`**
- Same `StateCard` component as stage-01's empty states, `tone="error"`,
  used here for a signature the user rejected in their wallet or an
  instruction that reverted on-chain.

### STAGE 03 · GRADUATE & MANAGE

**10. Graduation moment — `9a`** (+ toast variant `9b`)
- Purpose: celebratory confirmation when a bonding curve hits its $69,000
  threshold and migrates to a native AMM pool.
- Layout (`9a`, full page): nav → a progress rail (`SEED → GROWTH →
  GRADUATION ✓ → TRADING ON AMM`, all-green up to the checked step) →
  centered celebratory block: 64px circular 🎓 badge, "$ZKB graduated to a
  native AMM" h1, one-line explainer, then a 2-col **before/after**
  comparison (bonding-curve virtual reserves + market cap vs. AMM pool +
  initial liquidity + "LP tokens minted to protocol-owned liquidity"),
  finishing with `TRADE ON AMM` (filled) + `VIEW GRADUATION TX` (bordered)
  buttons.
- Layout (`9b`, toast variant): compact 520px feed-toast card — green-
  bordered/tinted, 🎓 avatar, "@zk_builder graduated to AMM" title, one-line
  detail, `TRADE ON AMM` chip + "dismiss" text. Shown inline in the live
  feed and as an auto-dismissing (8s) toast on the token page.
- Not yet componentized in `shipped-components/` — build both as one
  `GraduationEvent` component with a `variant: "page"|"toast"` prop.

**11. AMM trading — `10a`** (swap + pool stats, post-graduation)
- Purpose: primary trading surface once a token has graduated off the
  bonding curve.
- Layout: same nav pattern as `1a`, then a token header row (avatar,
  handle + verified check + `AMM · GRADUATED` pulse-blue pill, vertical/
  pool caption, right-aligned price + 24h delta) → 2-col grid (`1fr` chart/
  stats + `380px` swap panel).
- Left: SWAP / POOL / ANALYTICS tab row (green underline = active), bar
  chart (same up/down palette), 4-up stat grid (TVL, 24h volume, LP fee,
  pool reserves).
- Right: SWAP/ADD LIQUIDITY toggle, FROM/TO amount cards with balance
  captions, price-impact/LP-fee/slippage rows, full-width SWAP button.
- Related tabs in the same file, not required for MVP but worth reusing
  the pattern for: `10b` (add-liquidity detail incl. impermanent-loss
  warning + pool composition bar), `10c` (analytics — TVL/volume/fees/APR
  + top-LP leaderboard), `10e` (withdraw-liquidity flow with 25/50/100%
  quick-select), `10f` (TVL-milestone banner variant of this same page).
- Mobile parity: `10d` (single-column swap-only version in the 390px
  bezel, sticky bottom SWAP button).

**12. Wallet portfolio — `11a`**
- Purpose: user's own holdings + activity overview, connect-adjacent.
- Layout: nav (with Feed/Wallet breadcrumb) → portfolio-value header
  (big mono `$` figure + 24h delta, right-aligned DEPOSIT (filled) /
  WITHDRAW (bordered) buttons) → 2-col grid (`1fr` holdings table +
  recent-activity list, `380px` wallet-details panel).
- Holdings table: Asset / Balance / Value / 24h columns, mixed row types
  (SOL, a bonding-curve token, an AMM token, an NFT — the "24h" column
  shows `—` for NFTs). Recent activity: simple 3-line list (action, delta +
  timestamp).
- Right panel: address card (address + "copy" + network line) and a
  standing `⚠ Phase 0 preview — mock balances` disclaimer banner
  (`border-noise/30`-style warning card) — keep this until real balances
  are wired.

**13. Deposit / Withdraw modals — `11b` / `11c`**
- Deposit (`11b`): 460px modal, title + close, a placeholder QR block
  (checkerboard pattern — swap for a real QR of the deposit address),
  "YOUR DEPOSIT ADDRESS" label + copyable address row, and a red-bordered
  "only send SOL/SPL on Solana mainnet" warning.
- Withdraw (`11c`): 460px modal, destination-address input (empty/
  placeholder state shown), amount input with a MAX-balance quick-fill,
  a fee-breakdown card (network fee / you'll receive), full-width `REVIEW
  WITHDRAWAL` button (which should hand off to the `11d` sign-transaction
  overlay).

**14. Notifications panel — `12f`** *(new)*
- Purpose: activity feed — graduations, referrals, mentions, price alerts.
- Layout: dropdown-style card, max-width 380px, `bg-[#0f1620] border
  border-white/10 rounded-sm`. Header: title + "Mark all read"
  (`text-signal font-mono text-[10px]`). Rows: colored dot by type
  (`bg-signal` graduation, `bg-pulse` referral, `bg-white/15` mention/
  price), unread rows get a faint tint (`bg-signal/[0.03]` or
  `bg-pulse/[0.03]`), read rows dim to `text-[#9aa4af]`. Footer: centered
  "View all".
- **Shipped:** `shipped-components/notifications/notifications-panel.tsx`
  → `NotificationsPanel`. Parent owns the `notifications` array;
  `onMarkAllRead`/`onViewAll` are stubs to wire to real state.

**15. Settings / profile — `12e`** *(new)*
- Purpose: account management — identity, notification prefs, wallet.
- Layout: single panel, `rounded-sm border border-white/[0.08]
  bg-[#0f1620]`, three stacked sections separated by `border-b
  border-white/[0.06]`: (1) profile header — 44px avatar circle, `@handle`
  + green verified badge, fee-tier line; (2) notifications — label + a
  30×16px pill toggle per pref row (price alerts, graduation events,
  mentions, referral activity), `bg-signal` on / `bg-white/10` off,
  sliding 12px knob; (3) connected wallet — address row with live-dot,
  mono address, `text-noise` "Disconnect" action.
- **Shipped:** `shipped-components/settings/settings-panel.tsx` →
  `SettingsPanel`. Parent owns the `prefs` array; `onTogglePref(id)`
  should persist the preference (mirror the existing
  `waitlist-store.ts` pattern).

### STAGE 04 · CREATOR PATH (branch — parallel to trading, entered from a
"Launch a token" CTA anywhere in the app)

**C1. Choose mechanism — `2a`** (launch step 1 of 4)
- Layout: nav → "Launch a token" h1 → 4-step progress rail (MECHANISM →
  ATTEST HANDLE → SEED & REVIEW → LAUNCH, numbered circles, current step
  filled green) → 2-col grid (`1fr` mechanism picker + `380px` live
  preview).
- Mechanism picker: 2×2 grid of option cards (Bonding Curve — selected/
  default, green border + `DEFAULT` tag; Dutch Auction; Conviction Curve;
  Revenue Share), each with a name + one-line description.
- Live preview panel: mono key/value card mirroring the connected X
  handle's live mindshare stats (mindshare %, seed tier, seed market cap,
  graduation threshold), one-line note that creator fees unlock after
  attestation, full-width `CONTINUE → ATTEST HANDLE` button.
- Mobile parity: `8b` (step 1 only, single-column card list, top progress
  bar instead of the numbered rail, sticky CONTINUE footer).

**C2. Attest handle — `3a`** (launch step 2 of 4)
- Same progress rail, now on step 2 (step 1 shows a green check).
- Left: centered "SAS" badge circle, "Attest your X handle on-chain" h2,
  explainer paragraph, bordered `SIGN IN WITH X` button, "awaiting
  attestation" status line with a grey pulse dot.
- Right: live-preview card showing mechanism/handle/verification (pending,
  red) /creator-fee (locked) — disabled `CONTINUE` button until verified.

**C3. Seed & review — `3b`** (launch step 3 of 4)
- Steps 1–2 now show green checks, step 3 active.
- Left: handle summary row (avatar, handle, verified check, "SAS-attested"
  caption) → a bordered key/value summary card (mechanism, seed tier +
  mindshare %, seed market cap, virtual SOL reserves, graduation threshold,
  creator fee) → a required checkbox acknowledging experimental-software
  risk.
- Right: est. network cost card (mint+curve init, SAS attestation fees,
  bold total), full-width `CONTINUE → LAUNCH` button.

**C4. Confirm & launch — `3c`** (launch step 4 of 4)
- All 4 steps green-checked. Centered success block: 72px green check
  circle, "@zk_builder is live" h2, one-line summary, a 3-up mono stat row
  (token symbol / tx hash / mindshare rank), then `VIEW TOKEN PAGE`
  (filled) + `SHARE ON X` (bordered) buttons. This is the terminal state of
  the creator path — routes into the trader flow via "View token page"
  (→ `1a`).

**C5. Launch an NFT — `4a`** *(optional, post-launch)*
- Purpose: attach a Metaplex Core NFT collection to an already-launched
  token market.
- Layout: nav (breadcrumb → handle → "Launch NFT") → h1 → 3-up type picker
  (Genesis — fee-share, transferable, selected by default; Perk —
  upgradeable fee-discount tiers; 1-of-1 Auction — single-edition art/music)
  → 2-col config grid (`1fr` genesis config fields: collection size, fee-
  share pool %, mint price, per-NFT share — `380px` live preview card
  showing the NFT + its entitlement, full-width `CREATE COLLECTION`
  button).

**C6. Verification SBT surfaces — `4b`** (reference screen, not a new
  component)
- Documents where the green verified checkmark + its underlying soulbound
  SAS credential appear across the app: profile header (hover the check to
  see a credential card — attests/program/issued date/soulbound tag), a
  "credentials on this wallet" 3-up grid (Verification SBT · soulbound,
  Genesis NFT · transferable, Perk NFT · upgradeable), and a small gallery
  of "everywhere else the ✓ appears" (feed row, token header, creator-fee-
  claimable indicator). Use this as the spec for the verified-badge
  component and its hover/tooltip credential card — not a standalone screen
  to build.

**C7. Perk upgrades / 1-of-1 auction — `5a` / `5b`**
- Perk ladder (`5a`): h1 + subhead, 3-col tier grid (Tier 1 — owned,
  dimmed; Tier 2 — current, green-bordered; Tier 3 — next, blue-bordered
  with cost/requirement + `UPGRADE TO TIER 3` button), plus a progress bar
  toward the next tier's trade-count requirement.
- 1-of-1 auction (`5b`): 2-col layout — large artwork/audio placeholder +
  title/creator/description on the left; on the right, a countdown timer,
  current-bid card, a bid input + `BID` button (with a computed minimum),
  and a bid-history list.

**C8. Gated / unverified profile state — `5c`**
- Purpose: shows a creator profile before SAS attestation — the "why
  verify" motivator.
- Layout: greyscale/desaturated avatar, `UNVERIFIED` red-outlined pill next
  to the handle, right-aligned `ATTEST HANDLE VIA SAS →` CTA. Below: a red
  warning banner ("Creator fees are locked" + accrued-but-unclaimable SOL
  figure). Below that: a dashed-border "No verification SBT yet" empty
  state explaining that Genesis/Perk NFTs stay locked to the profile until
  attested.

## Interactions & Behavior (cross-cutting)
- **Wallet connect → verify → sign → confirm** is one continuous chain:
  `12a` → (`12c` if unverified) → `11d` → `12b`. Any buy/sell/swap/deposit/
  withdraw/launch action routes through `11d` then `12b`.
- **Rejection anywhere** in that chain lands on `12d` (`tone="error"`),
  with a retry action wired back to the same instruction.
- **Graduation (`9a`/`9b`)** is a passive, server/chain-driven event — no
  user action triggers it; poll or subscribe to curve state and fire the
  toast (`9b`) or, if the user is already on the token page, transition it
  to the AMM layout (`10a`).
- **Creator path** can be entered from anywhere via a persistent "Launch a
  token" CTA; it's a straight 4-step linear wizard (`2a`→`3a`→`3b`→`3c`)
  with no branching until the optional NFT step (`4a`) after launch.
- No animations beyond: `Loader2` spin (pending tx), toggle knob slide
  (`transition-all`), and the landing page's ticker-tape marquee
  (`af-ticker-scroll`, 22s linear infinite, duplicated content for a
  seamless loop).

## State Management
- `WalletConnectModal` (`12a`): `open` boolean lives in the parent.
- `TxStatus` (`12b`) / `VerifyHandleFlow` (`12c`): fully controlled —
  parent owns `state`/`step` and advances it after each successful
  signature/confirmation.
- `StateCard` (`12d`): stateless, presentation-only.
- `SettingsPanel` (`12e`) / `NotificationsPanel` (`12f`): parent owns the
  `prefs`/`notifications` arrays, passes down handlers — no internal state.
- Everything else (feed, token detail, AMM, wallet portfolio, launch
  wizard) is currently mock/static data in the HTML reference — plan for
  each to be driven by real feed/chain state once Phase 1 data is live,
  same pattern as `signal-board.tsx`.

## Assets
No new image/icon assets — all icons are `lucide-react` (already a repo
dependency) in the shipped components; the HTML reference uses inline
emoji/unicode glyphs as stand-ins (🎓, ✓, ⚠, ⌕, ←, ↓) — replace with the
repo's icon set. Avatars, wallet logos, and chart data are all placeholders
(repeating gradient/checkerboard patterns) — swap for real profile images,
wallet marks, and a real charting library.

## Files
- `Token Trading Page.dc.html` — full design reference, all turns (1–12).
  Turns are numbered by design session, newest first in the file; the
  option IDs cited throughout this README are the ones selected for
  production. Everything not cited above is prior exploration, kept for
  history only.
- `shipped-components/` — the six already-translated TSX components
  (wallet connect, tx status, verify handle, error/empty state, settings,
  notifications) + its own README with exact drop-in paths under
  `app/attention_fi_frontend/components/`.
