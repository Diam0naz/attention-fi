use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{AMM_SEED, CURVE_SEED, GLOBAL_SEED, GUARDIANS_SEED};
use crate::error::AttentionError;
use crate::events::PoolCreatedEvent;
use crate::guardians;
use crate::state::{AmmPool, BondingCurve, Global};

#[derive(Accounts)]
pub struct Graduate<'info> {
    /// Permissionless: anyone can trigger migration once the curve is complete.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = curve)]
    pub curve_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        space = 8 + AmmPool::INIT_SPACE,
        seeds = [AMM_SEED, mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = pool,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

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
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

/// Migrate a graduated curve's real SOL + remaining tokens into a native AMM pool.
/// The pool PDA's `init` makes this once-only. Accrued creator fees stay on the curve.
pub fn graduate_handler(ctx: Context<Graduate>) -> Result<()> {
    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(
        ctx.accounts.curve.complete,
        AttentionError::NotReadyToGraduate
    );

    let sol = ctx.accounts.curve.real_sol_reserves;
    let tokens = ctx.accounts.curve.real_token_reserves;
    let mint_key = ctx.accounts.mint.key();

    // Move the remaining tokens: curve vault -> pool vault (curve PDA signs).
    let curve_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[ctx.accounts.curve.bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.curve_vault.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            curve_seeds,
        ),
        tokens,
    )?;

    // Move the real SOL: curve -> pool (both program-owned; direct lamports).
    **ctx
        .accounts
        .curve
        .to_account_info()
        .try_borrow_mut_lamports()? -= sol;
    **ctx
        .accounts
        .pool
        .to_account_info()
        .try_borrow_mut_lamports()? += sol;

    let pool = &mut ctx.accounts.pool;
    pool.mint = mint_key;
    pool.sol_reserves = sol;
    pool.token_reserves = tokens;
    pool.bump = ctx.bumps.pool;

    let curve = &mut ctx.accounts.curve;
    curve.real_sol_reserves = 0;
    curve.real_token_reserves = 0;

    emit!(PoolCreatedEvent {
        mint: mint_key,
        sol_reserves: sol,
        token_reserves: tokens,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
