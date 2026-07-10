use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{CURVE_SEED, GLOBAL_SEED};
use crate::curve::sell_quote;
use crate::error::AttentionError;
use crate::state::{BondingCurve, Global};

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = curve)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = seller)]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn sell_handler(ctx: Context<Sell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
    require!(token_amount > 0, AttentionError::ZeroAmount);
    require!(!ctx.accounts.curve.complete, AttentionError::CurveComplete);

    let global = &ctx.accounts.global;
    let curve = &ctx.accounts.curve;
    let quote = sell_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        token_amount,
        global.fee_bps,
    )?;
    require!(
        quote.sol_out >= min_sol_out,
        AttentionError::SlippageExceeded
    );
    require!(
        quote.sol_from_curve <= curve.real_sol_reserves,
        AttentionError::InsufficientReserves
    );

    // Seller -> vault (tokens).
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        token_amount,
    )?;

    // Curve -> seller (net) and curve -> treasury (fee). The curve PDA is
    // program-owned, so lamports are moved directly rather than via a system CPI.
    **ctx
        .accounts
        .curve
        .to_account_info()
        .try_borrow_mut_lamports()? -= quote.sol_from_curve;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? += quote.sol_out;
    if quote.fee > 0 {
        **ctx
            .accounts
            .treasury
            .to_account_info()
            .try_borrow_mut_lamports()? += quote.fee;
    }

    // Update reserves.
    let curve = &mut ctx.accounts.curve;
    curve.virtual_token_reserves = curve
        .virtual_token_reserves
        .checked_add(token_amount)
        .ok_or(AttentionError::MathOverflow)?;
    curve.virtual_sol_reserves = curve
        .virtual_sol_reserves
        .checked_sub(quote.sol_from_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_token_reserves = curve
        .real_token_reserves
        .checked_add(token_amount)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_sol_reserves = curve
        .real_sol_reserves
        .checked_sub(quote.sol_from_curve)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
