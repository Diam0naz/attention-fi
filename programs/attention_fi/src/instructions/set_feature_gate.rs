use anchor_lang::prelude::*;

use crate::constants::{FEATUREGATE_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::FeatureGateEvent;
use crate::features::validate_mask;
use crate::state::{FeatureGate, Global};

/// Switch product features off (or back on) for new entries. Authority-only.
///
/// `init_if_needed`, so this can be installed on a live program. Until it
/// runs, every feature is enabled; see `features.rs` for what a disabled
/// feature still allows.
#[derive(Accounts)]
pub struct SetFeatureGate<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + FeatureGate::INIT_SPACE,
        seeds = [FEATUREGATE_SEED],
        bump,
    )]
    pub feature_gate: Account<'info, FeatureGate>,

    pub system_program: Program<'info, System>,
}

pub fn set_feature_gate_handler(ctx: Context<SetFeatureGate>, disabled: u32) -> Result<()> {
    validate_mask(disabled)?;

    let bump = ctx.bumps.feature_gate;
    let gate = &mut ctx.accounts.feature_gate;
    gate.disabled = disabled;
    gate.bump = bump;

    emit!(FeatureGateEvent {
        authority: ctx.accounts.authority.key(),
        disabled,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
