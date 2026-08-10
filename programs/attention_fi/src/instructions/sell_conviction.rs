use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{CONVICTION_SEED, GLOBAL_SEED, GUARDIANS_SEED, POSITION_SEED};
use crate::conviction::early_exit_penalty;
use crate::curve::sell_quote;
use crate::error::AttentionError;
use crate::guardians;
use crate::state::{ConvictionCurve, ConvictionPosition, Global};

#[derive(Accounts)]
pub struct SellConviction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,

    /// CHECK: must equal the treasury recorded in Global. Also receives the
    /// early-exit penalty (LP-reward proxy until real LP distribution ships).
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [CONVICTION_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Box<Account<'info, ConvictionCurve>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = curve)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = seller)]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, mint.key().as_ref(), seller.key().as_ref()],
        bump = position.bump,
        has_one = mint,
    )]
    pub position: Box<Account<'info, ConvictionPosition>>,

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

    pub token_program: Program<'info, Token>,
}

pub fn sell_conviction_handler(
    ctx: Context<SellConviction>,
    token_amount: u64,
    min_sol_out: u64,
) -> Result<()> {
    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(token_amount > 0, AttentionError::ZeroAmount);
    require!(!ctx.accounts.curve.complete, AttentionError::CurveComplete);
    require!(
        token_amount <= ctx.accounts.position.amount,
        AttentionError::InsufficientPosition
    );

    let global = &ctx.accounts.global;
    let curve = &ctx.accounts.curve;
    let quote = sell_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        token_amount,
        global.fee_bps,
    )?;
    require!(
        quote.sol_from_curve <= curve.real_sol_reserves,
        AttentionError::InsufficientReserves
    );

    // Apply the early-exit penalty if the position is still locked. The penalty
    // is redirected from the seller to the treasury; reserve math is unchanged.
    let now = Clock::get()?.unix_timestamp;
    let penalty = if now < ctx.accounts.position.unlock_time {
        early_exit_penalty(quote.sol_out, curve.early_exit_penalty_bps)?
    } else {
        0
    };
    let to_seller = quote
        .sol_out
        .checked_sub(penalty)
        .ok_or(AttentionError::MathOverflow)?;
    let to_treasury = quote
        .fee
        .checked_add(penalty)
        .ok_or(AttentionError::MathOverflow)?;
    require!(to_seller >= min_sol_out, AttentionError::SlippageExceeded);

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

    // Curve -> seller (net) and curve -> treasury (fee + penalty), direct lamports.
    **ctx
        .accounts
        .curve
        .to_account_info()
        .try_borrow_mut_lamports()? -= quote.sol_from_curve;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? += to_seller;
    if to_treasury > 0 {
        **ctx
            .accounts
            .treasury
            .to_account_info()
            .try_borrow_mut_lamports()? += to_treasury;
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

    // Reduce the position.
    let position = &mut ctx.accounts.position;
    position.amount = position
        .amount
        .checked_sub(token_amount)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
