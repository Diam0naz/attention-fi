use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{CURVE_SEED, GLOBAL_SEED, PERK_SEED};
use crate::curve::{buy_quote, split_creator_fee};
use crate::error::AttentionError;
use crate::events::{GraduateEvent, TradeEvent};
use crate::nft::discounted_fee_bps;
use crate::state::{BondingCurve, Global, PerkNft};

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

    /// Optional perk NFT owned by the buyer; grants a trading-fee discount.
    /// Constrained to a perk PDA owned by the buyer when supplied.
    #[account(
        seeds = [PERK_SEED, perk.asset.as_ref()],
        bump = perk.bump,
        constraint = perk.owner == buyer.key() @ AttentionError::Unauthorized,
    )]
    pub perk: Option<Account<'info, PerkNft>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn buy_handler(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
    require!(sol_amount > 0, AttentionError::ZeroAmount);
    require!(!ctx.accounts.curve.complete, AttentionError::CurveComplete);

    let global = &ctx.accounts.global;
    let curve = &ctx.accounts.curve;
    // A perk NFT held by the buyer reduces the trading fee.
    let fee_bps = match &ctx.accounts.perk {
        Some(perk) => discounted_fee_bps(global.fee_bps, perk.discount_bps),
        None => global.fee_bps,
    };
    let quote = buy_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        curve.real_token_reserves,
        sol_amount,
        fee_bps,
    )?;
    require!(quote.tokens_out > 0, AttentionError::ZeroAmount);
    require!(
        quote.tokens_out >= min_tokens_out,
        AttentionError::SlippageExceeded
    );

    // Split the fee: creator cut accrues in the curve account, protocol cut to treasury.
    let (creator_cut, treasury_cut) = split_creator_fee(quote.fee, global.creator_fee_share_bps)?;

    // Buyer -> curve (reserves + creator accrual, both held in the curve account).
    let to_curve = quote
        .sol_into_curve
        .checked_add(creator_cut)
        .ok_or(AttentionError::MathOverflow)?;
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.curve.to_account_info(),
            },
        ),
        to_curve,
    )?;

    // Buyer -> treasury (protocol cut).
    if treasury_cut > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_cut,
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

    // Update reserves, emit, and check graduation.
    let graduation_sol = global.graduation_sol;
    let buyer_key = ctx.accounts.buyer.key();
    let now = Clock::get()?.unix_timestamp;
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
    curve.creator_fees = curve
        .creator_fees
        .checked_add(creator_cut)
        .ok_or(AttentionError::MathOverflow)?;

    emit!(TradeEvent {
        mint: curve.mint,
        user: buyer_key,
        is_buy: true,
        sol_amount,
        token_amount: quote.tokens_out,
        fee: quote.fee,
        virtual_sol_reserves: curve.virtual_sol_reserves,
        virtual_token_reserves: curve.virtual_token_reserves,
        real_sol_reserves: curve.real_sol_reserves,
        timestamp: now,
    });

    if curve.real_sol_reserves >= graduation_sol {
        curve.complete = true;
        emit!(GraduateEvent {
            mint: curve.mint,
            real_sol_reserves: curve.real_sol_reserves,
            real_token_reserves: curve.real_token_reserves,
            timestamp: now,
        });
    }

    Ok(())
}
