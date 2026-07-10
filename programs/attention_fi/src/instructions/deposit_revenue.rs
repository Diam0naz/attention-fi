use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::REVENUE_SEED;
use crate::error::AttentionError;
use crate::revenue::acc_increment;
use crate::state::RevenueShare;

#[derive(Accounts)]
pub struct DepositRevenue<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [REVENUE_SEED, mint.key().as_ref()],
        bump = revenue.bump,
        has_one = mint,
    )]
    pub revenue: Account<'info, RevenueShare>,

    /// CHECK: only used to derive the pool PDA.
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Deposit `amount` lamports of revenue to be split pro-rata across current
/// stakers. Callable by anyone (in practice the creator / fee router).
pub fn deposit_revenue_handler(ctx: Context<DepositRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, AttentionError::ZeroAmount);

    let increment = acc_increment(amount, ctx.accounts.revenue.total_staked)?;

    // Depositor -> pool account (held for claims).
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.revenue.to_account_info(),
            },
        ),
        amount,
    )?;

    let revenue = &mut ctx.accounts.revenue;
    revenue.acc_revenue_per_share = revenue
        .acc_revenue_per_share
        .checked_add(increment)
        .ok_or(AttentionError::MathOverflow)?;
    revenue.revenue_reserves = revenue
        .revenue_reserves
        .checked_add(amount)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
