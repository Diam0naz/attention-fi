use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::amm::swap_quote;
use crate::constants::{AMM_SEED, GLOBAL_SEED, PERK_SEED};
use crate::error::AttentionError;
use crate::events::AmmSwapEvent;
use crate::nft::{discounted_fee_bps, perk_discount_bps};
use crate::state::{AmmPool, Global, PerkNft};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        mut,
        seeds = [AMM_SEED, mint.key().as_ref()],
        bump = pool.bump,
        has_one = mint,
    )]
    pub pool: Account<'info, AmmPool>,

    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = pool)]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = trader,
        associated_token::mint = mint,
        associated_token::authority = trader,
    )]
    pub trader_token_account: Account<'info, TokenAccount>,

    /// Optional perk NFT owned by the trader; grants a trading-fee discount.
    /// Constrained to a perk PDA owned by the trader when supplied — same shape
    /// as Buy and Sell, because a perk that stops working the moment a token
    /// graduates is a benefit withdrawn exactly when it starts to matter.
    #[account(
        seeds = [PERK_SEED, perk.asset.as_ref()],
        bump = perk.bump,
        constraint = perk.owner == trader.key() @ AttentionError::Unauthorized,
    )]
    pub perk: Option<Account<'info, PerkNft>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Swap on the graduated AMM pool. `is_buy` = SOL in / tokens out; otherwise
/// tokens in / SOL out. The fee is retained in the pool.
pub fn swap_handler(
    ctx: Context<Swap>,
    amount_in: u64,
    min_amount_out: u64,
    is_buy: bool,
) -> Result<()> {
    require!(amount_in > 0, AttentionError::ZeroAmount);

    // The pool retains its fee rather than routing it out, so a discount here
    // slows protocol-owned liquidity rather than cutting anyone's revenue —
    // the price of keeping one promise ("off every trade") across both venues.
    let fee_bps = match &ctx.accounts.perk {
        Some(perk) => {
            discounted_fee_bps(ctx.accounts.global.fee_bps, perk_discount_bps(perk.level))
        }
        None => ctx.accounts.global.fee_bps,
    };
    let mint_key = ctx.accounts.mint.key();
    let trader_key = ctx.accounts.trader.key();
    let pool_bump = ctx.accounts.pool.bump;
    let (sol_reserves, token_reserves) = (
        ctx.accounts.pool.sol_reserves,
        ctx.accounts.pool.token_reserves,
    );

    let now = Clock::get()?.unix_timestamp;

    if is_buy {
        let quote = swap_quote(sol_reserves, token_reserves, amount_in, fee_bps)?;
        require!(quote.amount_out > 0, AttentionError::ZeroAmount);
        require!(
            quote.amount_out >= min_amount_out,
            AttentionError::SlippageExceeded
        );

        // Trader -> pool (SOL in, fee retained implicitly).
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.trader.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // Pool vault -> trader (tokens); pool PDA signs.
        let signer_seeds: &[&[&[u8]]] = &[&[AMM_SEED, mint_key.as_ref(), &[pool_bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            quote.amount_out,
        )?;

        let pool = &mut ctx.accounts.pool;
        pool.sol_reserves = pool
            .sol_reserves
            .checked_add(amount_in)
            .ok_or(AttentionError::MathOverflow)?;
        pool.token_reserves = pool
            .token_reserves
            .checked_sub(quote.amount_out)
            .ok_or(AttentionError::MathOverflow)?;

        emit!(AmmSwapEvent {
            mint: mint_key,
            trader: trader_key,
            is_buy: true,
            amount_in,
            amount_out: quote.amount_out,
            sol_reserves: pool.sol_reserves,
            token_reserves: pool.token_reserves,
            timestamp: now,
        });
    } else {
        let quote = swap_quote(token_reserves, sol_reserves, amount_in, fee_bps)?;
        require!(quote.amount_out > 0, AttentionError::ZeroAmount);
        require!(
            quote.amount_out >= min_amount_out,
            AttentionError::SlippageExceeded
        );
        require!(
            quote.amount_out <= sol_reserves,
            AttentionError::InsufficientReserves
        );

        // Trader -> pool vault (tokens in).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // Pool -> trader (SOL out); pool is program-owned, direct lamports.
        **ctx
            .accounts
            .pool
            .to_account_info()
            .try_borrow_mut_lamports()? -= quote.amount_out;
        **ctx
            .accounts
            .trader
            .to_account_info()
            .try_borrow_mut_lamports()? += quote.amount_out;

        let pool = &mut ctx.accounts.pool;
        pool.token_reserves = pool
            .token_reserves
            .checked_add(amount_in)
            .ok_or(AttentionError::MathOverflow)?;
        pool.sol_reserves = pool
            .sol_reserves
            .checked_sub(quote.amount_out)
            .ok_or(AttentionError::MathOverflow)?;

        emit!(AmmSwapEvent {
            mint: mint_key,
            trader: trader_key,
            is_buy: false,
            amount_in,
            amount_out: quote.amount_out,
            sol_reserves: pool.sol_reserves,
            token_reserves: pool.token_reserves,
            timestamp: now,
        });
    }

    Ok(())
}
