use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::GENPOOL_SEED;
use crate::error::AttentionError;
use crate::revenue::acc_increment;
use crate::state::GenesisPool;

#[derive(Accounts)]
pub struct DepositGenesisFee<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [GENPOOL_SEED, subject_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, GenesisPool>,

    /// CHECK: only used to derive the pool PDA.
    pub subject_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Route `amount` lamports of a token's fees to its genesis NFT holders,
/// split pro-rata by `share_bps`.
pub fn deposit_genesis_fee_handler(ctx: Context<DepositGenesisFee>, amount: u64) -> Result<()> {
    require!(amount > 0, AttentionError::ZeroAmount);

    let increment = acc_increment(amount, ctx.accounts.pool.total_share_bps)?;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.pool.to_account_info(),
            },
        ),
        amount,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.acc_per_share = pool
        .acc_per_share
        .checked_add(increment)
        .ok_or(AttentionError::MathOverflow)?;
    pool.reserves = pool
        .reserves
        .checked_add(amount)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
