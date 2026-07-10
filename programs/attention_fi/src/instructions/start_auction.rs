use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

use crate::constants::{AUCTION_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::state::{DutchAuction, Global, MindshareTier};

#[derive(Accounts)]
pub struct StartAuction<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// New SPL mint (client-generated keypair, signs creation).
    #[account(
        init,
        payer = creator,
        mint::decimals = global.token_decimals,
        mint::authority = auction,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + DutchAuction::INIT_SPACE,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, DutchAuction>,

    /// Auction-owned vault holding the full allocation for sale.
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = auction,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn start_auction_handler(
    ctx: Context<StartAuction>,
    tier: MindshareTier,
    start_price: u64,
    floor_price: u64,
    duration: i64,
) -> Result<()> {
    require!(
        start_price >= floor_price,
        AttentionError::InvalidAuctionParams
    );
    require!(floor_price > 0, AttentionError::InvalidAuctionParams);
    require!(duration > 0, AttentionError::InvalidAuctionParams);

    let global = &ctx.accounts.global;
    let total_supply = global.token_total_supply;

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.auction;
    let signer_seeds: &[&[&[u8]]] = &[&[AUCTION_SEED, mint_key.as_ref(), &[bump]]];

    // Mint the entire allocation into the auction vault.
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.auction.to_account_info(),
            },
            signer_seeds,
        ),
        total_supply,
    )?;

    // Fix the supply.
    token::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.auction.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;
    auction.mint = mint_key;
    auction.creator = ctx.accounts.creator.key();
    auction.start_price = start_price;
    auction.floor_price = floor_price;
    auction.start_time = now;
    auction.duration = duration;
    auction.total_for_sale = total_supply;
    auction.tokens_sold = 0;
    auction.real_sol_reserves = 0;
    auction.tier = tier.as_u8();
    auction.complete = false;
    auction.bump = bump;

    let global = &mut ctx.accounts.global;
    global.tokens_launched = global
        .tokens_launched
        .checked_add(1)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
