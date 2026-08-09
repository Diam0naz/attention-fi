use anchor_lang::prelude::*;

use crate::constants::TRADER_SEED;
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
}

pub fn open_trader_stats_handler(ctx: Context<OpenTraderStats>) -> Result<()> {
    let stats = &mut ctx.accounts.stats;
    stats.owner = ctx.accounts.owner.key();
    stats.volume_lamports = 0;
    stats.deposits_lamports = 0;
    stats.bump = ctx.bumps.stats;
    Ok(())
}
