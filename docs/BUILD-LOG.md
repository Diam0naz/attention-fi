# AttentionFi — v1 build log

Every change on `v1`, in order, with what was wrong and why it happened.
Covers **2026-08-06 → 2026-08-15**, 64 commits, from a working scaffold to a
devnet-complete protocol.

Written to be read for the reasoning rather than the changelog. The commit
subjects say what changed; this says *why it was broken in the first place*,
because that is the part that transfers to the next project.

Read [Recurring lessons](#recurring-lessons) first if you only read one section.
It is the compressed version of everything below it.

---

## The arc

| Phase | Dates | What it was about |
|---|---|---|
| 1. NFT layer | Aug 6 | Collections, skins, burning, the 1-of-1 market |
| 2. Real data | Aug 7 | Replacing generated placeholders with the chain; the indexer |
| 3. Reachability | Aug 8–9 | Instructions that existed on-chain and had no caller |
| 4. Safety | Aug 9–10 | Security review, emergency stop, compliance, rate limits |
| 5. Correctness | Aug 11–15 | Deep bugs found by using the thing |

---

## Phase 1 — The NFT layer (Aug 6)

**`f1fd79d` the picker's empty state said nothing**
Tapping + on an empty collection opened a panel with no assets and a live-looking
ADD button. The action worked; there was nothing to act on. Two different
situations — no standalone NFTs at all, versus everything already filed here —
now say which. The button is hidden rather than disabled: *a greyed control still
reads as "this should work" and invites clicking; absent is clearer than inert.*

**`006ff67` offering assets Core would refuse to move** ⭐
Adding four NFTs failed at simulation with `0x1a` — mpl-core's `NoApprovals`.
**Owning an asset is not the same as being allowed to change it.** Core authorises
`UpdateV2` against the *update authority*; the picker filtered on memcmp offset 1,
the *owner*. So an NFT bought from someone else was offered — yours to transfer,
still theirs to update. Invisible until submit, and because adds are batched, one
unmovable asset took every good one down with it.

**`24b2ef2` CI died before running anything**
`anchor-cli` depends on hidapi → libudev, absent on GitHub runners. Underneath
that was a job that could never pass: `anchor test` needs preloaded SAS
attestations whose keypairs were never committed. CI now runs what is
reproducible — `anchor build` (catches SBF stack-frame failures the host clippy
job structurally cannot see) plus `cargo test`.

**`bf356e0` burn had no path; the signature skin never rendered**
`burn_nft` had been deployed since the collections work with zero call sites — an
NFT minted by mistake was yours forever.

**`0e3756c` · `6c9b691` · `0e1d34b`** — contrast over worn artwork, blank cards for
assets minted without their own image, and the lanyard sampling colour from the
wrong source. `6c9b691` is the origin of `artworkUrl()`: an asset with no picture
has its `uri` pointing at the *metadata document*, which renders as nothing in an
`<img>`.

**`ddae476` · `eea235a` · `ad5a8bc` a genesis NFT didn't say what it paid**
The card read "0.3% · REVENUE SHARE" — a share of nothing in particular. Two
independent causes, only one a display problem: the static handle→mint seeds lived
inside the *client* registry, so a configured token was fully named in the browser
and entirely unknown server-side.

**`d695cf2` · `6e9621c` · `fb3e1b1` · `cd30e08` the collection market**
Sale price recorded on-chain; whole collections sellable; listing made free and
perpetual with *visibility* as the paid thing. A collection has its own plugin
registry, so recording a sale is one write regardless of size — an earlier claim
that it would be unbounded work was wrong.

**`6cd8934` "1 of 1" was a false claim**
Every collectible read `1 of 1 / EDITION`, including collection members. A member
*is* unique — what membership changes is that it belongs to a set. So it became
"1 of 8" and the EDITION label dropped, because "1 of 8 / EDITION" claims an
eight-print run, which is a different and false thing.

---

## Phase 2 — Real data (Aug 7)

**`fa5bcb3` · `e0df9ab` the portfolio was generated from the wallet address** ⭐
`getPortfolio()` derived positions deterministically from the address — stable
across reloads, plausible per wallet. **That is the worst kind of placeholder: it
looks like data rather than like a gap.** Three token panels were the same trick
from a hash of the handle.

**`f9156e4` · `e39d507` · `92e4767` graduation**
Both order screens hardcoded the bonding curve, so a graduated token couldn't
trade. Graduation is a *trapdoor*: `curve.complete` is set inside the buy that
crosses the threshold, and from that instant buy and sell both refuse — so the
trade that graduates a token is the last trade anyone makes on it. Now routed by
venue, warned before, and holders notified.

**The indexer saga — `b4ba019` → `92503e7` → `d7967c6` → `a5f9219` → `089ac62`** ⭐
The activity feed was empty on a program with 141 transactions. This took **five
commits and four wrong diagnoses**, and it is the most instructive sequence here:

1. `b4ba019` — every failed `getTransaction` was caught and skipped *without a
   count*, so a rate-limited RPC and an unused program produced byte-identical
   output: `scanned 141, indexed 0`.
2. `92503e7` — fixing that made the crawl slow enough to exceed the serverless
   timeout, so it was killed mid-flight and lost everything including the cursor.
3. `d7967c6` — **the actual bug.** The cursor was leapfrogging over unread
   history. Decoding was never broken.
4. `a5f9219` — `getTransaction` is rate-limited far harder than account reads;
   public devnet refuses after ~10 in a row. Gave history reads their own RPC.
5. `089ac62` — **the other actual bug.** Anchor's IDL declares `AmmSwapEvent`;
   `EventParser` hands back `ammSwapEvent`. All 148 events decoded correctly and
   all 148 fell through to `default`.

*Lesson: an empty result with no error is a diagnosis problem before it is a bug.*

**`b2fdee6` genesis NFTs promised fees nothing paid** ⭐
`GenesisPool`, the accumulator maths and `claim_genesis_fee` were all correct and
had been for weeks. **Nothing funded the pool.** `deposit_genesis_fee`'s only
callers were the dispatch in `lib.rs` and one test — so the NFT promised "a cut of
every trade, forever" with no mechanism connecting it to a trade.

**`1f50357` the profile said wallets held nothing**
A dozen `getProgramAccounts` scans on load, public devnet rate-limiting well below
that. The symptom was not an error: every hook caught, degraded to empty, and the
page confidently reported an empty wallet.

---

## Phase 3 — Reachability (Aug 8–9)

The theme of this phase: **on-chain completeness is not shipping.**

**`0504fe5`** genesis groups, tunable economics, an NFT fee of its own — three
things that previously needed a redeploy.

**`75080d0` confirmations that never fired**
web3.js derives the websocket URL from the HTTP one by swapping scheme and adding
1 to the port. Reads go through `/api/rpc` so the key never reaches the browser —
and nothing listens on origin+1. Every landed transaction was reported as failed.

**`ad5958b` listing a genesis run was a one-way door**
`mint_genesis_batch` mints into an escrow only `buy_genesis_unit` can empty, and
`list_genesis_group` hands authority to a PDA. A run that didn't sell out stranded
the creator's own NFTs *and* the rent paid for them.

**`d9b9c2d`** six instructions on-chain with nothing reaching them → `/nft/runs`.

**`2ccaf6f` five holes from a security review** ⭐
*Three of these let value be taken from people who had paid for it, and none
needed an attacker to be clever.*

**`6ca4607` fees shown but unclaimable**
The profile had displayed CLAIMABLE FEES for weeks. `claim_creator_fee` had no
caller anywhere. Devnet had **0.8 SOL** sitting in one curve with nothing able to
release it.

**`5d7e6ac` perks nothing could earn**
`PERK_LEVEL_ACTIVITY_LAMPORTS` described a 1/5/20/75/250 SOL ladder and nothing
referenced it. `TraderStats` documented itself as "updated on every buy/sell" and
**no instruction touched it.** Rebuilt as permissionless: traders accrue, claim and
level up themselves rather than waiting to be issued something.

**`61d4e5b` the test suite hadn't compiled in weeks**
11 of 14 describes, 32 type errors. CI never caught it because the workflow ran
`anchor build` + `cargo test` instead of `anchor test` — a decision made for good
reasons that quietly stopped covering the thing it was meant to cover.

**`e861aee`** three more instructions with no caller, each priced in the admin
console — *so the gap read as a working feature from every angle except use.*

---

## Phase 4 — Safety (Aug 9–10)

**`90a3c98` an emergency stop no single key can undo** ⭐
Cites Pump's May 2024 exploit — a former employee who kept migration access.
Nothing here could be halted at all. The design is deliberately **asymmetric: one
guardian can stop the protocol, a threshold is required to restart it.** Stopping
is the safe direction; resuming is the dangerous one, so they must not cost the
same. Claims stay open while paused on purpose — pausing must not confiscate.

**`e24d9c2` the oracle couldn't exist**
`launch_from_feed`, `update_mindshare` and `oracle_feed::read_mindshare_bps` had
been complete for weeks and none could run: `scripts/create-feed.ts` was never
committed, so there was no way to provision a feed. *The blocker was a missing
script, not the program.*

**`7b139a5` geo-block, disclosure, launch rate limit**
The rate limit is a **sliding window, not a resetting counter**: three launches at
23:59 and three at 00:01 is six in two minutes and entirely within the rules.
Finding that boundary is the first thing a script does. Storing actual timestamps
costs 24 bytes and means what it says.

**`c7465ec` listing a 1-of-1 never left the browser** ⭐
`list_nft_auction` takes `collection_auction` as an optional account, and
**Anchor's TS client never resolves optional accounts.** Neither call site named
it, so both failed before signing. Same class as the `traderStats` failure —
worth internalising as a rule, not a one-off.

**`7d25461` · `6346982` disavowal**
Lets a subject disown a token that names them. Buying closes; **selling and
claiming stay open** — holders must not be trapped by a flag. Then an audit found
the two instructions I'd shipped an hour earlier had no UI. *For a disavowal that
is the same as not existing: the whole value is acting within minutes of a public
objection, and "clone the repo and run ts-node" is not that.*

---

## Phase 5 — Correctness (Aug 11–15)

Everything here was found by *using* the product.

**`fc716aa` launched tokens had no artwork anywhere**
Empty `uri`, so every wallet and explorer showed a mint address and a grey box.
Launch metadata is written `is_mutable = false`, so the URI is permanent — which
is exactly why it points at a *route* rather than a file: the one immutable thing
stays short and stable while what it returns can still be corrected.

**`207ff46` every token launched at the same tier** ⭐
The launch screen read `const mindshare = 0.98`. **The one number the entire
product is about was a constant.** Every creator was told they sat at the same
mindshare. Now priced from the 24h time-weighted average, not spot — spot is a
single instant and a launch can be timed against a spike, which is the same reason
the on-chain oracle reads the average.

**`19e0a12`** CI had failed on every push for a day. `-D warnings` turns clippy's
`manual_range_contains` into a hard error. Also: CI lints with `--all-targets`,
not the `--all-features` form in CLAUDE.md — the latter fails to resolve
`solana_program` and buries real findings under hundreds of E0433s.

**`c5a5198` selling a collection didn't hand over the cards** ⭐⭐
The worst bug in the project. `buy_collection` transferred the collection's update
authority and nothing else. **An mpl-core asset has two separate fields — `owner`
and `update_authority` — and only the second pointed at the collection.** So a
buyer paid for a deck, received the right to edit its metadata, and the seller
kept every card and could sell them again one at a time. Confirmed on devnet: two
sold collections, 100% of members still with the seller.

The code *stated the wrong belief as a design*: "the members travel with it
implicitly… without a single asset account being touched." True of authority,
false of ownership, and the difference was the entire value of the sale.

**`af7b1c6` the registry lost a token on every relaunch**
`handle text primary key` — one row per handle, forever. The chain had 11 launches
and the registry had 1.

**`0cb0134` anything could be listed exactly once, ever** ⭐
Both listing instructions opened their auction PDA with `init`, and **no path ever
closed it**. Seeds come from the asset or collection, so the account outlived the
listing and the seeds were spent permanently. *A buyer owned something they could
never sell on.*

**`582a778` a rate limit that couldn't say when it lifts**
`seconds_until_next()` had existed since the rate limit landed, with no caller
outside its own unit tests — and its own doc comment said why it existed: *"a
limit that can't tell you when it lifts reads as a bug."*

**`5de1e74`** `/rescue` — lets a seller deliver cards a pre-fix sale left behind.
mpl-core accepts exactly one signature for that, the current owner's, so no admin
key or buyer action can substitute.

**`14480fe`** the same genesis NFT rendered with artwork on `/nft` and blank on the
profile — two construction paths, only one setting `image`.

---

## Recurring lessons

The nine things that came up more than once.

### 1. "Deployed" is not "shipped" ⭐

The single most common failure in this project. Instructions that were correct,
tested, deployed, and had **no caller anywhere in the app**: `burn_nft`,
`claim_creator_fee` (0.8 SOL stranded), the whole perk ladder,
`deposit_genesis_fee`, six genesis-run instructions, `disavow_token`,
`seconds_until_next`.

Each read as a working feature from every angle except use. Now audited by script:

```
58 instructions · 55 reachable · 3 deliberately script-only
```

Run that audit before calling anything finished.

### 2. Plausible fake data is worse than no data ⭐

`getPortfolio()` from a wallet hash, three token panels from a handle hash,
`mindshare = 0.98`. All stable across reloads, all plausibly shaped. A blank panel
gets fixed in a day; a convincing one ships.

### 3. Distinguish "nothing there" from "couldn't look" ⭐

The indexer reported `scanned 141, indexed 0` whether the program was unused or
the RPC was refusing. The profile reported empty wallets during rate limiting.
`readTokenFacts` now throws `RpcUnavailable` rather than returning null, because
the caller *caches*, and one timeout would publish "this token does not exist" to
every wallet reading it.

### 4. In mpl-core, `owner` and `update_authority` are different powers ⭐

Cost two real bugs — the asset picker (`0x1a NoApprovals`) and the collection sale
that never delivered its cards. Transferring one does not move the other. Ask which
one a given operation actually authorises against.

### 5. Design the account's whole lifecycle, not its creation

`init` with no close path meant one listing per asset, forever. PDA seeds are an
address space: if a seed can be spent permanently, that is a design decision, so
make it deliberately.

### 6. Anchor specifics worth memorising

- **The TS client never auto-resolves optional accounts.** Callers must name them
  explicitly (`traderStats: null`). Cost two separate outages.
- **Accounts are sized exactly at creation**, so adding a field to a live account
  breaks deserialization. Hence separate PDAs for `FeeConfig`, `Guardians`,
  `LaunchPolicy`, `TokenDisavowal` rather than growing `Global`.
- **Event names come back camelCased** from `EventParser`, not as the IDL spells
  them.
- **`-D warnings` makes clippy pedantry a build failure.** Match CI's exact flags.

### 7. Empty-account-as-default

`guardians::require_live`, `launch_quota::policy_or_default`,
`revenue::genesis_share_bps`, `disavow_token::require_not_disavowed` all read an
absent account as the permissive default. Two reasons: a fresh deployment is
bounded from the first block rather than from whenever an admin gets to it, and a
missing config account can't brick the instruction. Safe **only because the address
is seed-pinned** — emptiness is a fact about the chain, not something a caller can
assert.

### 8. Make the safe direction cheap and the dangerous one expensive

One guardian can pause; a threshold is required to resume. Any guardian can flag a
token; only the authority can clear it. Symmetric permissions would mean the cost
of stopping an exploit equals the cost of enabling one.

### 9. The client and the program must be deployed together ⭐

A stale frontend bundle produced `InvalidProgramId` on every launch — the old
account list was missing `launch_policy`/`launch_quota`, so everything after index
6 shifted two places and the Associated Token program landed where System belonged.
Redeploying didn't help because Vercel builds `main`, which was 60 commits behind.

*When a transaction fails on account resolution, suspect version skew before logic.*

---

## Where v1 stands

- **58 instructions**, 55 reachable from the app. `initialize` and `set_authority`
  are script-only by design; `mint_perk` was superseded when perks became earned.
- **96 Rust unit tests**, 68 localnet integration tests.
- **Deployed to devnet**, bytecode hash-verified against the tested build.
- **Four mechanisms** (bonding, Dutch, conviction, revenue), four NFT roles
  (verification, perk, genesis, collectible), full fee routing, SAS verification,
  Switchboard oracle, guardian pause, disavowal, rate limiting.

Open, and non-code:

- External audit
- Legal opinion (the checklist wanted it before creator fees went live; they are)
- **The authority key is also one of the three guardians** — one compromise takes
  both roles, which defeats the pause's asymmetry
- `NEXT_PUBLIC_APP_URL` must be correct on the production project before launching
  anything, because launch metadata is immutable

---

## How to read a commit here

Messages follow one shape deliberately: **what was broken → why it happened → what
changed → what was verified.** The "why" paragraph is the part worth reading a
month later; the diff already says what changed.

```
git log --reverse origin/main..v1        # the whole arc
git show <hash>                          # one decision in full
```
