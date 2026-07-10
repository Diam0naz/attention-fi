# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AttentionFi is a Solana program (Anchor framework) with a Next.js frontend. The product concept
("Pump.fun for X" / attention-mindshare trading) is documented in static HTML design docs at
`app/attention_fi_frontend/components/attentionfi-*.html` — read these for product intent, since
the actual program and frontend are currently a bare Anchor/Next.js scaffold with no feature code
implemented yet.

This is a monorepo with two independent toolchains:
- Root: Anchor/Rust workspace (`programs/`, `tests/`, `migrations/`) managed with yarn.
- `app/attention_fi_frontend/`: Next.js app, its own `package.json`, has its own CLAUDE.md/AGENTS.md.

## Commands

Run from the repository root unless noted.

### Anchor program (Rust)
- Build: `anchor build`
- Test (builds, deploys to localnet, runs TS tests): `anchor test`
- Run TS test suite only (requires a running local validator + deployed program): `yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"`
- Run a single test file: `yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/attention_fi.ts`
- Lint/format Rust: `cargo fmt` and `cargo clippy --all-targets --all-features -- -D warnings`
- Format TS/JS (prettier): `yarn lint:fix` (check only: `yarn lint`)

Program ID and cluster config live in `Anchor.toml` (`localnet`, wallet at `~/.config/solana/id.json`).
Rust toolchain is pinned via `rust-toolchain.toml` (1.89.0).

### Frontend (`app/attention_fi_frontend/`)
- Dev server: `npm run dev` (or `next dev`)
- Build: `npm run build`
- Lint: `npm run lint` (eslint)

The frontend's own `CLAUDE.md` points to `AGENTS.md`, which warns that the installed Next.js
version has breaking changes vs. training data — check `node_modules/next/dist/docs/` before
writing frontend code that relies on Next.js API knowledge.

## Architecture

### Program structure (`programs/attention_fi/src/`)
Anchor programs in this repo follow a module-per-concern layout:
- `lib.rs` — program entrypoint, declares the program ID, re-exports `constants`/`instructions`/`state`, and wires `#[program]` handlers to instruction handler functions.
- `instructions.rs` + `instructions/*.rs` — one file per instruction; `instructions.rs` re-exports each submodule. Each instruction file defines its `Accounts` struct and a `handler(ctx: Context<...>) -> Result<()>` function. Instruction logic is invoked from `lib.rs` as `module::handler(ctx)`, not written inline in `lib.rs`.
- `state.rs` — on-chain account data structures.
- `constants.rs` — `#[constant]` values exposed in the IDL (e.g. PDA seeds).
- `error.rs` — `#[error_code]` enum for custom program errors.

When adding a new instruction: create `instructions/<name>.rs` with its `Accounts` struct + handler,
add `pub mod <name>;` and re-export in `instructions.rs`, then add a thin dispatch function in the
`#[program]` module in `lib.rs`.

### Frontend structure
Standard Next.js App Router layout (`app/`), with shared UI in `components/ui/` (shadcn/radix-ui
based) and helpers in `lib/`. Styling is Tailwind CSS v4 (via `@tailwindcss/postcss`).
