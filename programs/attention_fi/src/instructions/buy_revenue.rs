use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::auction::auction_quote;
use crate::constants::{GLOBAL_SEED, GUARDIANS_SEED, REVENUE_SEED, REVSTAKE_SEED, TRADER_SEED};
use crate::error::AttentionError;
use crate::guardians;
use crate::perks;
use crate::revenue::{accrued, pending};
use crate::state::{Global, RevenueShare, RevenueStake, TraderStats};

#[derive(Accounts)]
pub struct BuyRevenue<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: must equal the treasury recorded in Global. Receives the share
    /// purchase payment + fee (creator-raise routing is a later refinement).
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// Optional cumulative-activity record for the buyer. Capital committed
    /// here counts as a *deposit* rather than volume — `activity_score` weights
    /// deposits double, because locking money up is a stronger signal than a
    /// trade that can be reversed in the next block.
    #[account(
        mut,
        seeds = [TRADER_SEED, buyer.key().as_ref()],
        bump = trader_stats.bump,
    )]
    pub trader_stats: Option<Account<'info, TraderStats>>,

    #[account(
        mut,
        seeds = [REVENUE_SEED, mint.key().as_ref()],
        bump = revenue.bump,
        has_one = mint,
    )]
    pub revenue: Account<'info, RevenueShare>,

    /// CHECK: only used to derive the pool/stake PDAs and stamp the position.
    pub mint: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + RevenueStake::INIT_SPACE,
        seeds = [REVSTAKE_SEED, mint.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, RevenueStake>,

    /// The emergency stop.
    ///
    /// Required, never optional: an optional stop is not a stop — omitting it
    /// would help the caller, which is exactly the shape that made the genesis
    /// pool exploitable. Unchecked because an empty account is the legitimate
    /// "no guardian set installed yet" state rather than an error.
    ///
    /// CHECK: seeds pin the address; `guardians::require_live` validates it.
    #[account(seeds = [GUARDIANS_SEED], bump)]
    pub guardians: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn buy_revenue_handler(ctx: Context<BuyRevenue>, amount: u64) -> Result<()> {
    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(amount > 0, AttentionError::ZeroAmount);

    let global = &ctx.accounts.global;
    let revenue = &ctx.accounts.revenue;
    let remaining = revenue
        .token_total_supply
        .checked_sub(revenue.shares_sold)
        .ok_or(AttentionError::MathOverflow)?;
    require!(amount <= remaining, AttentionError::InsufficientShares);

    let quote = auction_quote(
        revenue.share_price,
        amount,
        global.token_decimals,
        global.fee_bps,
    )?;
    let total_due = quote
        .cost
        .checked_add(quote.fee)
        .ok_or(AttentionError::MathOverflow)?;

    // Buyer -> treasury (payment + fee).
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        total_due,
    )?;

    let acc = revenue.acc_revenue_per_share;

    // Settle any pending revenue into `unclaimed` before changing the stake.
    let position = &mut ctx.accounts.position;
    if position.staked_amount > 0 {
        let owed = pending(position.staked_amount, acc, position.reward_debt)?;
        position.unclaimed = position
            .unclaimed
            .checked_add(owed)
            .ok_or(AttentionError::MathOverflow)?;
    }
    position.owner = ctx.accounts.buyer.key();
    position.mint = ctx.accounts.mint.key();
    position.staked_amount = position
        .staked_amount
        .checked_add(amount)
        .ok_or(AttentionError::MathOverflow)?;
    position.reward_debt = accrued(position.staked_amount, acc)?;
    position.bump = ctx.bumps.position;

    let revenue = &mut ctx.accounts.revenue;
    revenue.shares_sold = revenue
        .shares_sold
        .checked_add(amount)
        .ok_or(AttentionError::MathOverflow)?;
    revenue.total_staked = revenue
        .total_staked
        .checked_add(amount)
        .ok_or(AttentionError::MathOverflow)?;

    // Credit this trade's committed capital toward the trader's perk level. Skipped
    // silently when the account isn't supplied — see `perks::record_activity`.
    perks::record_activity(
        ctx.accounts.trader_stats.as_deref_mut(),
        ctx.accounts.buyer.key(),
        0,
        total_due,
    )?;

    Ok(())
}
