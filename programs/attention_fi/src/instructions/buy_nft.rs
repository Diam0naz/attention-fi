use anchor_lang::prelude::*;
use anchor_lang::system_program;
use mpl_core::instructions::TransferV1CpiBuilder;

use crate::auction::current_price;
use crate::constants::{GLOBAL_SEED, NFTAUCTION_SEED};
use crate::error::AttentionError;
use crate::events::{NftAuctionEvent, NFT_SOLD};
use crate::state::{Global, NftAuction};

#[derive(Accounts)]
pub struct BuyNft<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: seller receiving the proceeds; bound by the auction's `creator`.
    #[account(mut, address = auction.creator)]
    pub creator: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [NFTAUCTION_SEED, asset.key().as_ref()],
        bump = auction.bump,
        has_one = asset,
    )]
    pub auction: Account<'info, NftAuction>,

    /// CHECK: the escrowed Core asset; bound by `auction.has_one = asset`.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn buy_nft_handler(ctx: Context<BuyNft>, max_price: u64) -> Result<()> {
    require!(!ctx.accounts.auction.complete, AttentionError::SoldOut);

    let auction = &ctx.accounts.auction;
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
    require!(price <= max_price, AttentionError::PriceAboveMax);

    let fee = u128::from(price)
        .checked_mul(u128::from(ctx.accounts.global.fee_bps))
        .and_then(|product| product.checked_div(10_000))
        .ok_or(AttentionError::MathOverflow)?;
    let fee = u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?;

    // Buyer -> creator (price), buyer -> treasury (fee on top).
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.creator.to_account_info(),
            },
        ),
        price,
    )?;
    if fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    // Transfer the escrowed NFT to the buyer; auction PDA (owner) signs.
    let asset_key = ctx.accounts.asset.key();
    let signer_seeds: &[&[&[u8]]] = &[&[NFTAUCTION_SEED, asset_key.as_ref(), &[auction.bump]]];
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.buyer.to_account_info())
        .authority(Some(&ctx.accounts.auction.to_account_info()))
        .new_owner(&ctx.accounts.buyer.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer_seeds)?;

    ctx.accounts.auction.complete = true;

    emit!(NftAuctionEvent {
        asset: asset_key,
        creator: ctx.accounts.creator.key(),
        counterparty: ctx.accounts.buyer.key(),
        outcome: NFT_SOLD,
        price,
        fee,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
