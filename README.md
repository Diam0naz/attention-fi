# AttentionFi

**Pump.fun for X — tokenize mindshare, trade attention on-chain.**

AttentionFi turns the scarcest resource on the internet — attention — into a
tradeable asset. Where Pump.fun launches tokens backed by nothing, AttentionFi
seeds each token from a **real underlying signal**: a subject's share of
crypto-Twitter conversation (mindshare), sourced from Kaito-style data. Every
token is a bonding-curve market whose starting price is anchored to the
subject's mindshare rank, tradeable the moment you connect a wallet, and
graduating to a native AMM once it reaches escape velocity.

Built on **Solana / Anchor**, with a **Next.js** front end.

> **Status:** active development. The on-chain program is feature-complete for
> Phase 1 and unit-tested; the front end is a Phase 0 preview (mock data +
> waitlist). Not audited. Not for production use.

---

## Why it's different

| | Pump.fun | AttentionFi |
| --- | --- | --- |
| Underlying asset | A meme / JPEG | X mindshare score |
| Price seed | Zero / virtual start | **Mindshare-proportional** |
| Launch mechanisms | One (bonding curve) | **Four** (curve, auction, conviction, revenue share) |
| Creator earnings | Partial | **0.5% perpetual, claimable on verification** |
| Identity | Anonymous wallet | **X handle attested on-chain (SAS)** |
| Price anchor | None | **Mindshare oracle (Switchboard)** |

---

## How it works

Four launch mechanisms, each matched to a different social primitive:

- **Bonding curve** *(default)* — constant-product virtual reserves; the
  mindshare tier seeds the starting `virtual_sol_reserves` so a top KOL doesn't
  start at zero. Graduates to an AMM at threshold.
- **Dutch auction** — descending price until the allocation fills; removes the
  front-running edge for narrative / project launches.
- **Conviction curve** — bonding with a mandatory hold; early exits forfeit a
  penalty. For community tokens where loyalty matters.
- **Revenue share** — a token = a pro-rata claim on a deposited revenue stream
  (MasterChef-style accumulator). The creator-economy model.

On top of the markets:

- **NFT layer (Metaplex Core)** — soulbound **verification** credentials
  (the anti-copycat identity moat), transferable **fee-share genesis** NFTs,
  upgradeable **perk** NFTs that grant trading-fee discounts, and **1-of-1
  auctions** for art/music verticals.
- **Fee wiring** — perk holders pay reduced fees; a token's fees split to the
  protocol treasury and route pro-rata to genesis holders; **creator fees are
  gated on SAS verification** (an unverified creator cannot claim).
- **Mindshare oracle** — `launch_from_feed` derives the launch tier on-chain
  from a Switchboard On-Demand feed instead of a trusted keeper argument.
- **Graduation** — `graduate` / `swap` migrate a completed curve's liquidity
  into a native constant-product AMM pool.
- **Events** — every launch, trade, graduation, and claim emits an event for
  off-chain indexing (e.g. a live feed via Helius geyser).

---

## Architecture

A monorepo with two independent toolchains:

```
attention_fi/
├── programs/attention_fi/     # Anchor (Rust) program
│   └── src/
│       ├── lib.rs             # program entrypoint + instruction dispatch
│       ├── instructions/      # one file per instruction
│       ├── state.rs           # on-chain accounts
│       ├── curve.rs           # constant-product math (pure, unit-tested)
│       ├── auction.rs         # Dutch-auction pricing (pure)
│       ├── revenue.rs         # pro-rata distribution accounting (pure)
│       ├── oracle.rs          # mindshare → tier mapping (pure)
│       ├── nft.rs             # Metaplex Core helpers + perk discounts
│       ├── amm.rs             # graduation AMM math
│       ├── events.rs          # on-chain events
│       ├── constants.rs · error.rs
├── tests/                     # TypeScript integration tests (ts-mocha)
│   └── fixtures/              # crafted SAS attestation accounts for localnet
├── app/attention_fi_frontend/ # Next.js front end (own README/AGENTS.md)
│   ├── app/                   # App Router pages + /api/waitlist routes
│   ├── components/            # feed, reactbits effects, waitlist
│   └── lib/                   # mock data + waitlist store
└── Anchor.toml · Cargo.toml
```

The program follows a **module-per-concern** layout: pricing/accounting math
lives in pure modules (unit-tested off-chain), while each instruction defines
its `Accounts` struct and handler.

---

## Tech stack

- **Program:** Anchor 0.32, anchor-spl (classic SPL Token), Metaplex Core,
  Solana Attestation Service, Switchboard On-Demand.
- **Front end:** Next.js (App Router), React 19, Tailwind CSS v4, react-bits
  (WebGL/OGL effects).
- **Tooling:** `cargo` / `anchor` / `ts-mocha` (program), `npm` (front end).

---

## Getting started

### Prerequisites

- Rust + the Solana toolchain (`agave` / `solana-cli`) and `anchor-cli` 0.32
- Node.js 20+ and a package manager
- A funded local keypair at `~/.config/solana/id.json`

### Program

```bash
# build the SBF program + IDL + TS types
anchor build

# fast, pure-math unit tests (no validator needed)
cargo test -p attention_fi --lib

# lint / format
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt
```

### Integration tests (localnet)

`anchor test` targets a surfpool simnet; where that is unavailable, run against a
manual validator:

```bash
solana-test-validator --reset --quiet \
  --bpf-program 8fQW2JbfNytdjJ7LR8dvKWMUtpeQPRqxAa3JZvBLsVVc target/deploy/attention_fi.so &

yarn install
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

That gets **15 of 22** cases passing. The remaining 7 need two things the
validator above doesn't have, and neither is currently reproducible from a
clean checkout:

- **Metaplex Core**, which every NFT case CPIs into. Without it those fail with
  `Unsupported program id`. Clone it onto the validator with
  `--clone CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d --url devnet`.
- **Crafted SAS attestation accounts**, preloaded with `--account <addr> <file>`.
  `verify_handle` only reads an attestation, so the suite fakes them rather than
  driving the SAS program — see `tests/fixtures/gen_sas_fixtures.py`.

The blocker is that `tests/fixtures/sas.json` hardcodes pubkeys, but the
keypairs those came from (`subject`, `subject2`, `bad`) and the account files
the generator writes (`att_valid.json`, `att_invalid.json`) were never
committed. Regenerating them produces different addresses than `sas.json`
expects, so the fixtures have to be regenerated *and* `sas.json` rewritten
together.

This is why CI runs `anchor build` and `cargo test` rather than the integration
suite: the pure-logic tests (curve, AMM, revenue, perk discounts) are
reproducible anywhere, and the SBF build catches target-specific failures the
host-target clippy job cannot.

### Front end

```bash
cd app/attention_fi_frontend
npm install
npm run dev        # http://localhost:3000
```

The Phase 0 front end runs on mock mindshare data and a local file-backed
waitlist (with a gamified referral leaderboard) — no smart contracts required.

---

## Roadmap

- **Phase 0 — Validate:** read-only mindshare feed + waitlist. *(front end in progress)*
- **Phase 1 — MVP:** bonding-curve launchpad, mindshare-seeded pricing, SAS
  handle binding, graduation to AMM. *(program feature-complete, unit-tested)*
- **Phase 2 — Mechanisms + creator economy:** Dutch auction, conviction curve,
  creator fee distribution, vertical curation. *(mechanisms built)*
- **Phase 3 — Live oracle + expansion:** on-chain mindshare rebalancing, price
  decay, private aggregation, revenue-share curve. *(oracle read built)*

---

## Branching model

- `main` — stable / release line (default branch).
- `master` — integration line.
- feature branches — cut from `master`, merged back via PR.

---

## Disclaimer

Experimental software under active development. It has **not** been audited and
is **not** intended for production or mainnet use. Tokens tied to real people's
reputation carry legal and reputational risk; see the strategy brief for the
threat model. Nothing here is financial or legal advice.
