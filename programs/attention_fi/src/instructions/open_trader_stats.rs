use anchor_lang::prelude::*;

use crate::constants::FEATUREGATE_SEED;
use crate::constants::TRADER_SEED;
use crate::features::{self, FEATURE_PERKS};
use crate::state::TraderStats;

/// Open the account that records a wallet's cumulative trading activity.
///
/// Permissionless and self-funded: a trader opens their own, once, and every
/// trade afterwards accrues to it. That is the whole point — perk levels are
/// gated on this number, so if the protocol had to create it the discount
/// would still be something granted rather than earned.
///
/// Separate from the trading instructions rather than `init_if_needed` inside
/// them. Creating an account costs rent, and a buy that quietly took an extra
/// 0.0016 SOL the first time would be charging for something the trader didn't
/// ask for. Here the cost is attached to the choice that incurs it.
///
/// Calling twice fails on the `init` constraint, which is the correct answer:
/// a second call could only reset a balance the first one is accumulating.
#[derive(Accounts)]
pub struct OpenTraderStats<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + TraderStats::INIT_SPACE,
        seeds = [TRADER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub stats: Account<'info, TraderStats>,

    pub system_program: Program<'info, System>,

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn open_trader_stats_handler(ctx: Context<OpenTraderStats>) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_PERKS)?;
    let stats = &mut ctx.accounts.stats;
    stats.owner = ctx.accounts.owner.key();
    stats.volume_lamports = 0;
    stats.deposits_lamports = 0;
    stats.bump = ctx.bumps.stats;
    Ok(())
}
