use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{CURVE_SEED, GLOBAL_SEED};
use crate::curve::buy_quote;
use crate::error::AttentionError;
use crate::state::{BondingCurve, Global};

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

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

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn buy_handler(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
    require!(sol_amount > 0, AttentionError::ZeroAmount);
    require!(!ctx.accounts.curve.complete, AttentionError::CurveComplete);

    let global = &ctx.accounts.global;
    let curve = &ctx.accounts.curve;
    let quote = buy_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        curve.real_token_reserves,
        sol_amount,
        global.fee_bps,
    )?;
    require!(quote.tokens_out > 0, AttentionError::ZeroAmount);
    require!(
        quote.tokens_out >= min_tokens_out,
        AttentionError::SlippageExceeded
    );

    // Buyer -> curve reserves.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.curve.to_account_info(),
            },
        ),
        quote.sol_into_curve,
    )?;

    // Buyer -> treasury (fee).
    if quote.fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            quote.fee,
        )?;
    }

    // Vault -> buyer (tokens), curve PDA signs.
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[curve.bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        quote.tokens_out,
    )?;

    // Update reserves and check graduation.
    let graduation_sol = global.graduation_sol;
    let curve = &mut ctx.accounts.curve;
    curve.virtual_sol_reserves = curve
        .virtual_sol_reserves
        .checked_add(quote.sol_into_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.virtual_token_reserves = curve
        .virtual_token_reserves
        .checked_sub(quote.tokens_out)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_sol_reserves = curve
        .real_sol_reserves
        .checked_add(quote.sol_into_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_token_reserves = curve
        .real_token_reserves
        .checked_sub(quote.tokens_out)
        .ok_or(AttentionError::MathOverflow)?;

    if curve.real_sol_reserves >= graduation_sol {
        curve.complete = true;
    }

    Ok(())
}
