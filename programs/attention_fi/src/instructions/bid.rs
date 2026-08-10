use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::auction::{auction_quote, current_price};
use crate::constants::{AUCTION_SEED, DISAVOW_SEED, GLOBAL_SEED, GUARDIANS_SEED};
use crate::error::AttentionError;
use crate::guardians;
use crate::instructions::disavow_token::require_not_disavowed;
use crate::state::{DutchAuction, Global};

#[derive(Accounts)]
pub struct Bid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump = auction.bump,
        has_one = mint,
    )]
    pub auction: Box<Account<'info, DutchAuction>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = auction)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = bidder,
        associated_token::mint = mint,
        associated_token::authority = bidder,
    )]
    pub bidder_token_account: Box<Account<'info, TokenAccount>>,

    /// Set when the token's subject has disowned it.
    ///
    /// Only the buy side carries this. Selling and claiming must keep working
    /// on a disowned token — freezing exits would make holders pay for somebody
    /// else's misrepresentation.
    ///
    /// CHECK: seeds pin the address; empty is the ordinary case and means
    /// "not disavowed".
    #[account(seeds = [DISAVOW_SEED, mint.key().as_ref()], bump)]
    pub disavowal: UncheckedAccount<'info>,

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
}

/// Buy `amount` base units at the auction's current descending price.
/// `max_price_per_token` guards against paying more than expected.
pub fn bid_handler(ctx: Context<Bid>, amount: u64, max_price_per_token: u64) -> Result<()> {
    // A disowned token can be sold, not bought.
    require_not_disavowed(&ctx.accounts.disavowal.to_account_info())?;

    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(amount > 0, AttentionError::ZeroAmount);

    let global = &ctx.accounts.global;
    let auction = &ctx.accounts.auction;
    require!(!auction.complete, AttentionError::SoldOut);

    let now = Clock::get()?.unix_timestamp;
    require!(
        now < auction.start_time + auction.duration,
        AttentionError::AuctionEnded
    );

    let price = current_price(
        auction.start_price,
        auction.floor_price,
        auction.start_time,
        auction.duration,
        now,
    )?;
    require!(price <= max_price_per_token, AttentionError::PriceAboveMax);

    // Clamp to the remaining allocation.
    let remaining = auction
        .total_for_sale
        .checked_sub(auction.tokens_sold)
        .ok_or(AttentionError::MathOverflow)?;
    require!(remaining > 0, AttentionError::SoldOut);
    let fill = amount.min(remaining);

    let quote = auction_quote(price, fill, global.token_decimals, global.fee_bps)?;

    // Bidder -> auction proceeds.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.bidder.to_account_info(),
                to: ctx.accounts.auction.to_account_info(),
            },
        ),
        quote.cost,
    )?;

    // Bidder -> treasury (fee).
    if quote.fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.bidder.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            quote.fee,
        )?;
    }

    // Vault -> bidder (tokens), auction PDA signs.
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[AUCTION_SEED, mint_key.as_ref(), &[auction.bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.bidder_token_account.to_account_info(),
                authority: ctx.accounts.auction.to_account_info(),
            },
            signer_seeds,
        ),
        fill,
    )?;

    let auction = &mut ctx.accounts.auction;
    auction.tokens_sold = auction
        .tokens_sold
        .checked_add(fill)
        .ok_or(AttentionError::MathOverflow)?;
    auction.real_sol_reserves = auction
        .real_sol_reserves
        .checked_add(quote.cost)
        .ok_or(AttentionError::MathOverflow)?;
    if auction.tokens_sold >= auction.total_for_sale {
        auction.complete = true;
    }

    Ok(())
}
