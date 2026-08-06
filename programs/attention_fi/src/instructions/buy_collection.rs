use anchor_lang::prelude::*;
use anchor_lang::system_program;
use mpl_core::instructions::UpdateCollectionV1CpiBuilder;

use crate::auction::current_price;
use crate::constants::{COLLECTIONAUCTION_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::{CollectionAuctionEvent, NFT_SOLD};
use crate::state::{CollectionAuction, Global};

/// Buy a listed collection at its current descending price.
///
/// Mirrors `buy_nft`, with the one structural difference that defines the
/// whole collection lifecycle: the buyer receives the collection's update
/// authority rather than ownership of an account. That single reassignment
/// hands over every member at once, since each asset names the collection as
/// its own authority.
///
/// No last-sale attribute is written here, unlike `buy_nft`. Attributes live
/// on assets, and writing to each member would be unbounded work in one
/// transaction — the sale price stays in the event for a collection.
#[derive(Accounts)]
pub struct BuyCollection<'info> {
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
        seeds = [COLLECTIONAUCTION_SEED, collection.key().as_ref()],
        bump = auction.bump,
        has_one = collection,
    )]
    pub auction: Account<'info, CollectionAuction>,

    /// CHECK: the escrowed Core collection; bound by `auction.has_one`.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn buy_collection_handler(ctx: Context<BuyCollection>, max_price: u64) -> Result<()> {
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

    // Hand the collection to the buyer; the escrow PDA signs as the current
    // update authority.
    let collection_key = ctx.accounts.collection.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        COLLECTIONAUCTION_SEED,
        collection_key.as_ref(),
        &[auction.bump],
    ]];
    UpdateCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.buyer.to_account_info())
        .authority(Some(&ctx.accounts.auction.to_account_info()))
        .new_update_authority(Some(&ctx.accounts.buyer.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .invoke_signed(signer_seeds)?;

    ctx.accounts.auction.complete = true;

    emit!(CollectionAuctionEvent {
        collection: collection_key,
        creator: ctx.accounts.creator.key(),
        counterparty: ctx.accounts.buyer.key(),
        outcome: NFT_SOLD,
        price,
        fee,
        timestamp: now,
    });
    Ok(())
}
