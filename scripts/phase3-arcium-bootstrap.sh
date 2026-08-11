#!/usr/bin/env bash
# ============================================================================
# AttentionFi — Phase 3 bootstrap: Arcium confidential mindshare aggregation
# ----------------------------------------------------------------------------
# Run from the repo root (where Anchor.toml lives). Idempotent — safe to re-run.
#
# What it does (maps to the Phase 3 build checklist):
#   1. Verifies the Arcium CLI is on the 0.9.x line (0.10+ targets Anchor 1.0
#      and would force the migration that breaks mpl-core / SAS / switchboard).
#   2. Pins arcium-anchor = "=0.9.7" in the program crate.
#   3. Scaffolds encrypted-ixs/ with the mindshare_agg Arcis circuit.
#   4. Drops request_mindshare.rs + mindshare_callback.rs instruction stubs
#      into programs/attention_fi/src/instructions/ (does NOT touch your
#      instructions.rs / lib.rs — wiring steps are printed at the end).
#   5. Runs `anchor build` to confirm the three existing integrations still
#      link. Set SKIP_BUILD=1 to scaffold without building.
# ============================================================================
set -euo pipefail

ARCIUM_ANCHOR_PIN="=0.9.7"
ARCIS_IMPORTS_PIN="0.9" # keep on the 0.9 line to match arcium-anchor
PROGRAM_DIR="programs/attention_fi"
INSTR_DIR="$PROGRAM_DIR/src/instructions"
ENC_DIR="encrypted-ixs"
SKIP_BUILD="${SKIP_BUILD:-0}"

say() { printf '\n\033[1;32m[phase3]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[phase3:warn]\033[0m %s\n' "$*"; }
die() {
  printf '\n\033[1;31m[phase3:err]\033[0m %s\n' "$*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 0. Sanity
# ---------------------------------------------------------------------------
[ -f Anchor.toml ] || die "Anchor.toml not found — run this from the repo root."
[ -d "$PROGRAM_DIR" ] || die "$PROGRAM_DIR not found — adjust PROGRAM_DIR at the top of this script."

# ---------------------------------------------------------------------------
# 1. Toolchain check — must be 0.9.x, NOT the installed 0.10.4
# ---------------------------------------------------------------------------
if ! command -v arcium >/dev/null 2>&1; then
  die "arcium CLI not found. Install arcup, then: arcup install 0.9.7 (or latest 0.9.x)."
fi

ARCIUM_VER="$(arcium --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)"
say "Detected arcium CLI: ${ARCIUM_VER:-unknown}"

case "$ARCIUM_VER" in
0.9.*)
  say "CLI is on the 0.9 line — matches arcium-anchor $ARCIUM_ANCHOR_PIN. Good."
  ;;
*)
  warn "CLI $ARCIUM_VER targets the wrong line (0.10+ = Anchor 1.0 / solana 3)."
  warn "Switch it before building the MXE:"
  warn "    arcup list            # see available versions"
  warn "    arcup install 0.9.7   # or the latest 0.9.x shown"
  warn "Continuing with scaffolding only — do NOT run 'arcium build' until switched."
  ;;
esac

# ---------------------------------------------------------------------------
# 2. Pin arcium-anchor in the program crate
# ---------------------------------------------------------------------------
if grep -q 'arcium-anchor' "$PROGRAM_DIR/Cargo.toml"; then
  say "arcium-anchor already present in $PROGRAM_DIR/Cargo.toml — leaving as-is."
  grep 'arcium-anchor' "$PROGRAM_DIR/Cargo.toml"
else
  say "Pinning arcium-anchor $ARCIUM_ANCHOR_PIN in $PROGRAM_DIR ..."
  (cd "$PROGRAM_DIR" && cargo add "arcium-anchor@$ARCIUM_ANCHOR_PIN")
fi

# ---------------------------------------------------------------------------
# 3. Scaffold the Arcis circuit crate (encrypted-ixs/)
# ---------------------------------------------------------------------------
if [ -d "$ENC_DIR" ]; then
  say "$ENC_DIR/ already exists — not overwriting."
else
  say "Scaffolding $ENC_DIR/ (mindshare_agg circuit) ..."
  mkdir -p "$ENC_DIR/src"

  cat >"$ENC_DIR/Cargo.toml" <<TOML
# NOTE: the empty [workspace] table is load-bearing.
#
# The root Cargo.toml declares members = ["programs/*"], so this crate sits
# inside the workspace directory without being a member — which cargo rejects
# ("current package believes it's in a workspace when it's not"). Declaring its
# own workspace detaches it, so scaffolding this directory cannot break the
# existing, working \`anchor build\`.
#
# The Arcium template instead lists encrypted-ixs as a workspace member. If
# \`arcium build\` turns out to require that, delete this table and add
# "encrypted-ixs" to the root members list — but re-run \`anchor build\` after,
# because feature unification across the shared lockfile is exactly how the
# mpl-core / SAS / switchboard versions would get dragged.
[workspace]

[package]
name = "encrypted-ixs"
version = "0.1.0"
edition = "2021"

[dependencies]
# Keep on the 0.9 line — must match arcium-anchor $ARCIUM_ANCHOR_PIN.
# Confirm the exact matching patch on docs.rs before first build.
arcis-imports = "$ARCIS_IMPORTS_PIN"
TOML

  cat >"$ENC_DIR/src/lib.rs" <<'RUST'
use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    /// Max engagement sources aggregated per computation.
    /// Arcis needs fixed-size arrays — unused tail entries are zero-padded
    /// (zeros contribute nothing to either sum, so no length field is needed).
    pub const MAX_SOURCES: usize = 16;

    /// Encrypted engagement inputs for one subject/mint.
    /// These are the values that must never be observable on-chain,
    /// otherwise they can be targeted (coordinated mentions, bot engagement)
    /// to pump a token's seed price.
    pub struct MindshareInputs {
        /// Smart-follower weight per source, basis points (0..=10_000).
        pub follower_weights_bps: [u16; MAX_SOURCES],
        /// Mention count per source over the sampling window.
        pub mention_counts: [u16; MAX_SOURCES],
    }

    /// Weighted mindshare aggregation.
    ///
    /// The OUTPUT is revealed (plaintext) — the aggregate score is public by
    /// design and feeds `oracle::tier_from_mindshare_bps` on-chain, exactly
    /// like the Switchboard `launch_from_feed` path. Only the raw INPUTS stay
    /// confidential end-to-end.
    #[instruction]
    pub fn mindshare_agg(input_ctxt: Enc<Shared, MindshareInputs>) -> u64 {
        let input = input_ctxt.to_arcis();

        let mut weighted_sum: u64 = 0;
        let mut total_mentions: u64 = 0;

        for i in 0..MAX_SOURCES {
            let mentions = input.mention_counts[i] as u64;
            let weight = input.follower_weights_bps[i] as u64;
            weighted_sum += mentions * weight;
            total_mentions += mentions;
        }

        // Weighted average in bps.
        //
        // TODO(mpc-division): secret/secret division is expensive in MPC and
        // branching on a masked condition isn't allowed, so a plain
        // `if total_mentions > 0` guard won't compile. The `+ 1` below is the
        // cheap divide-by-zero guard (negligible bias at real mention volumes).
        // Alternative if division proves too costly at MAX_SOURCES=16:
        // reveal (weighted_sum, total_mentions) as a pair and divide in the
        // callback — leaks only aggregate mention volume, never per-source data.
        let score_bps = weighted_sum / (total_mentions + 1);

        score_bps.reveal()
    }
}
RUST
  say "Wrote $ENC_DIR/Cargo.toml and $ENC_DIR/src/lib.rs"
fi

# ---------------------------------------------------------------------------
# 4. Instruction stubs (request + callback)
# ---------------------------------------------------------------------------
mkdir -p "$INSTR_DIR"

if [ -f "$INSTR_DIR/request_mindshare.rs" ]; then
  say "request_mindshare.rs already exists — not overwriting."
else
  cat >"$INSTR_DIR/request_mindshare.rs" <<'RUST'
//! Phase 3 — confidential sibling of `launch_from_feed`.
//! Queues the `mindshare_agg` MXE computation and stores a pending record.
//!
//! NOTE: account-struct attribute macros and the `queue_computation` /
//! `Argument` signatures below follow the documented Arcium pattern — verify
//! the exact 0.9.7 shapes against docs.rs/arcium-anchor/0.9.7 before build
//! (current docs.arcium.com tracks the newer 0.10+/1.0 line).
//!
//! READ THE ORDERING NOTE in mindshare_callback.rs before wiring this up: the
//! request/callback split is asynchronous, and `launch_from_feed` is atomic.
//! That difference is a design decision, not a porting detail.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*; // TODO: confirm import path for 0.9.7

/// Comp-def offset derived from the encrypted instruction name.
pub const COMP_DEF_OFFSET_MINDSHARE_AGG: u32 = comp_def_offset("mindshare_agg");

/// Pending confidential mindshare request, keyed by mint.
#[account]
pub struct PendingMindshare {
    pub mint: Pubkey,
    pub requester: Pubkey,
    pub computation_offset: u64,
    pub requested_at: i64,
    pub bump: u8,
}

impl PendingMindshare {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1;
    pub const SEED: &'static [u8] = b"pending_mindshare";
}

/// One-time (per circuit) comp-def initialization, run after deploy.
/// TODO: annotate with the 0.9.x init-comp-def accounts macro, e.g.
///   #[init_computation_definition_accounts("mindshare_agg", payer)]
#[derive(Accounts)]
pub struct InitMindshareAggCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // + mxe_account, comp_def_account, arcium_program, system_program
    //   (generated per the macro above)
}

pub fn init_mindshare_agg_comp_def(ctx: Context<InitMindshareAggCompDef>) -> Result<()> {
    // TODO: confirm 0.9.7 arity — examples use init_comp_def(ctx.accounts, true, ...)
    init_comp_def(ctx.accounts, true, None, None)?;
    Ok(())
}

/// TODO: annotate with the 0.9.x queue accounts macro, e.g.
///   #[queue_computation_accounts("mindshare_agg", payer)]
/// which generates the Arcium system accounts (mxe, mempool, executing_pool,
/// computation_account, comp_def_account, cluster_account, pool, clock, ...).
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RequestMindshare<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Mint of the subject token whose curve will be seeded.
    /// CHECK: validated against the curve PDA in the callback.
    pub mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = PendingMindshare::SPACE,
        seeds = [PendingMindshare::SEED, mint.key().as_ref()],
        bump,
    )]
    pub pending: Account<'info, PendingMindshare>,

    pub system_program: Program<'info, System>,
    // + Arcium accounts from the macro above
}

pub fn request_mindshare(
    ctx: Context<RequestMindshare>,
    computation_offset: u64,
    // Encrypted MindshareInputs — exact ciphertext layout/sizes come from
    // `arcium build` output for the circuit; adjust after first MXE build.
    ciphertext: Vec<u8>,
    pub_key: [u8; 32],
    nonce: u128,
) -> Result<()> {
    let pending = &mut ctx.accounts.pending;
    pending.mint = ctx.accounts.mint.key();
    pending.requester = ctx.accounts.payer.key();
    pending.computation_offset = computation_offset;
    pending.requested_at = Clock::get()?.unix_timestamp;
    pending.bump = ctx.bumps.pending;

    // TODO: match the generated Argument layout for MindshareInputs.
    // Documented pattern:
    //   let args = vec![
    //       Argument::ArcisPubkey(pub_key),
    //       Argument::PlaintextU128(nonce),
    //       Argument::EncryptedU16(...), // one per field / packed struct
    //   ];
    //   queue_computation(ctx.accounts, args, vec![], None)?;
    let _ = (ciphertext, pub_key, nonce);
    todo!("wire Argument vec + queue_computation once arcium build emits the circuit ABI")
}
RUST
  say "Wrote $INSTR_DIR/request_mindshare.rs"
fi

if [ -f "$INSTR_DIR/mindshare_callback.rs" ]; then
  say "mindshare_callback.rs already exists — not overwriting."
else
  cat >"$INSTR_DIR/mindshare_callback.rs" <<'RUST'
//! Phase 3 — Arcium-invoked callback for `mindshare_agg`.
//! Receives the revealed aggregate score and maps it to a tier the same way the
//! Switchboard path does: score → oracle::tier_from_mindshare_bps → tier seed.
//! Only the SOURCE of the score changes.
//!
//! ── ORDERING: decide this before writing the body ────────────────────────────
//! `launch_from_feed` is ATOMIC. In one instruction it reads the feed, derives
//! the tier, mints the supply, writes metadata and revokes the mint authority.
//! The price is known before the token can be traded.
//!
//! The Arcium path is ASYNCHRONOUS: `request_mindshare` queues, and this
//! callback lands in a later transaction. So "seed the curve here" only works
//! if the curve was NOT already open for trading, and the two ways to arrange
//! that are not equivalent:
//!
//!   (a) Callback performs the launch. `request_mindshare` creates nothing
//!       tradeable; this callback mints, writes metadata and revokes. Price is
//!       still settled before anyone can trade. Costs more here — the callback
//!       has to carry every account `launch_from_feed` needs, and it runs in
//!       Arcium's transaction, not the creator's.
//!
//!   (b) Launch first at a placeholder tier, re-seed on callback. Simpler to
//!       write and WRONG unless trading is blocked in between: re-seeding
//!       `virtual_sol_reserves` after buys have landed moves the price under
//!       existing holders. If you take this route, the curve must be created
//!       in a non-tradeable state that this callback clears.
//!
//! (a) is the one that matches the guarantee `launch_from_feed` already makes.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*; // TODO: confirm import path for 0.9.7

use super::request_mindshare::PendingMindshare;
// use crate::oracle::tier_from_mindshare_bps;
// use crate::state::BondingCurve;

#[event]
pub struct MindshareSettled {
    pub mint: Pubkey,
    pub score_bps: u64,
}

/// TODO: annotate with the 0.9.x callback accounts macro, e.g.
///   #[callback_accounts("mindshare_agg", payer)]
#[derive(Accounts)]
pub struct MindshareAggCallback<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [PendingMindshare::SEED, pending.mint.as_ref()],
        bump = pending.bump,
        close = payer,
    )]
    pub pending: Account<'info, PendingMindshare>,

    // TODO: the subject's curve account, same constraints as launch_from_feed:
    // #[account(mut, seeds = [CURVE_SEED, pending.mint.as_ref()], bump)]
    // pub curve: Account<'info, BondingCurve>,
    //
    // Under option (a) above this also needs the mint, vault, metadata,
    // token_metadata_program, token_program, system_program and rent accounts
    // that launch_from_feed carries.

    // + arcium_program, comp_def_account, cluster_account, instructions sysvar
    //   (generated per the macro above)
}

/// TODO: 0.9.x output type — newer line uses
/// `SignedComputationOutputs<MindshareAggOutput>` + `output.verify_output(...)`;
/// verify the 0.9.7 equivalent (plain `ComputationOutputs` + byte parse) on
/// docs.rs before build.
#[arcium_callback(encrypted_ix = "mindshare_agg")]
pub fn mindshare_agg_callback(
    ctx: Context<MindshareAggCallback>,
    output: ComputationOutputs,
) -> Result<()> {
    // 1. Parse the revealed u64 score (bps) from the computation output.
    let score_bps: u64 = todo!("parse revealed output per 0.9.7 ABI");

    // 2. Reuse the EXISTING, unit-tested mapping — it is already correct and
    //    covered by tests in oracle.rs; do not reimplement the thresholds:
    // let tier = tier_from_mindshare_bps(score_bps);
    //
    // 3. Apply the tier per whichever ordering option the module doc settles on.

    // 4. Emit for indexers — outputs observable, inputs never.
    emit!(MindshareSettled {
        mint: ctx.accounts.pending.mint,
        score_bps,
    });

    Ok(())
}
RUST
  say "Wrote $INSTR_DIR/mindshare_callback.rs"
fi

# ---------------------------------------------------------------------------
# 5. Verify the existing integrations still link
# ---------------------------------------------------------------------------
if [ "$SKIP_BUILD" = "1" ]; then
  say "SKIP_BUILD=1 — skipping 'anchor build'."
else
  say "Running 'anchor build' to confirm mpl-core / SAS / switchboard still link with arcium-anchor pinned ..."
  if anchor build; then
    say "anchor build OK — dependency pin is compatible."
  else
    warn "anchor build failed. If the failure is in dependency resolution, check that"
    warn "cargo picked arcium-anchor 0.9.7 exactly:  cargo tree -p arcium-anchor"
  fi
fi

# ---------------------------------------------------------------------------
# Next steps (manual wiring — intentionally not automated)
# ---------------------------------------------------------------------------
cat <<'NEXT'

============================================================================
 Phase 3 scaffolding done. Manual wiring left (in order):
============================================================================
 0. Settle the ORDERING question in the mindshare_callback.rs module doc
    (async callback vs. atomic launch_from_feed). Everything below assumes a
    choice has been made; option (a) — callback performs the launch — is the
    one that preserves the existing guarantee.
 1. lib.rs: replace #[program] with #[arcium_program] on the program module.
    Re-export the new instructions from instructions.rs — this repo uses
    instructions.rs + instructions/*.rs, NOT instructions/mod.rs:
        pub mod mindshare_callback;   pub use mindshare_callback::*;
        pub mod request_mindshare;    pub use request_mindshare::*;
    then add thin dispatch fns in the #[program] module, as CLAUDE.md describes.
 2. Toolchain: ensure `arcium --version` reports 0.9.x
    (arcup list && arcup install 0.9.7), then: arcium build
    → grab the emitted circuit ABI and replace the two todo!()s
      (Argument vec in request_mindshare, output parse in the callback).
 3. Arcium.toml: if missing (project predates arcium init), generate a scratch
    project with the 0.9 CLI — `arcium init /tmp/arcium-scratch` — and copy
    its Arcium.toml + localnet config over.
 4. Verify against docs.rs/arcium-anchor/0.9.7: the account-struct attribute
    macros, init_comp_def arity, and ComputationOutputs shape (docs.arcium.com
    tracks the newer 0.10+/1.0 line — do NOT copy from there blindly).
 5. Test on the Arcium localnet cluster: arcium test
============================================================================
NEXT
