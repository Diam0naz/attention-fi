use anchor_lang::prelude::*;

use crate::constants::{REVENUE_SEED, REVSTAKE_SEED};
use crate::error::AttentionError;
use crate::revenue::{accrued, pending};
use crate::state::{RevenueShare, RevenueStake};

#[derive(Accounts)]
pub struct ClaimRevenue<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(
        mut,
        seeds = [REVENUE_SEED, mint.key().as_ref()],
        bump = revenue.bump,
        has_one = mint,
    )]
    pub revenue: Account<'info, RevenueShare>,

    /// CHECK: only used to derive the pool/stake PDAs.
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [REVSTAKE_SEED, mint.key().as_ref(), holder.key().as_ref()],
        bump = position.bump,
        has_one = mint,
        has_one = owner,
    )]
    pub position: Account<'info, RevenueStake>,

    /// CHECK: bound by the position's `has_one = owner`; equals the holder.
    #[account(address = holder.key())]
    pub owner: UncheckedAccount<'info>,
}

/// Claim all settled + pending revenue for the caller's position.
pub fn claim_revenue_handler(ctx: Context<ClaimRevenue>) -> Result<()> {
    let acc = ctx.accounts.revenue.acc_revenue_per_share;
    let position = &ctx.accounts.position;

    let owed = position
        .unclaimed
        .checked_add(pending(position.staked_amount, acc, position.reward_debt)?)
        .ok_or(AttentionError::MathOverflow)?;
    require!(
        owed <= ctx.accounts.revenue.revenue_reserves,
        AttentionError::InsufficientReserves
    );

    if owed > 0 {
        // Pool -> holder (direct lamports; the pool PDA is program-owned).
        **ctx
            .accounts
            .revenue
            .to_account_info()
            .try_borrow_mut_lamports()? -= owed;
        **ctx
            .accounts
            .holder
            .to_account_info()
            .try_borrow_mut_lamports()? += owed;
    }

    let staked_amount = position.staked_amount;
    let revenue = &mut ctx.accounts.revenue;
    revenue.revenue_reserves = revenue
        .revenue_reserves
        .checked_sub(owed)
        .ok_or(AttentionError::MathOverflow)?;

    let position = &mut ctx.accounts.position;
    position.unclaimed = 0;
    position.reward_debt = accrued(staked_amount, acc)?;

    Ok(())
}
