use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateCollectionV1CpiBuilder;

use crate::constants::{COLLECTIONAUCTION_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::CollectionListedEvent;
use crate::nft::collection_size;
use crate::state::{CollectionAuction, Global};

/// List an entire mpl-core collection as a descending auction.
///
/// A collection is not an asset and cannot be escrowed like one. `BaseAssetV1`
/// has an owner and `TransferV1` moves it; `BaseCollectionV1` has only an
/// update authority, and there is no transfer instruction for it at all. So
/// selling a collection means reassigning that authority, and "escrow" here
/// means handing it to this PDA until the listing resolves.
///
/// The practical consequence for a seller: while listed, they can no longer
/// mint into the collection or change it, because those are exactly the powers
/// being sold. `reclaim_collection_auction` hands them back if nobody buys.
///
/// The members travel with it implicitly. Each asset stores the collection as
/// its own `UpdateAuthority`, so the buyer acquires authority over every piece
/// without a single asset account being touched — which is also why this can't
/// be done piecemeal, and why `size` is recorded in the event as the count the
/// buyer was offered.
#[derive(Accounts)]
pub struct ListCollectionAuction<'info> {
    /// Current update authority of the collection; must sign to hand it over.
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init,
        payer = creator,
        space = 8 + CollectionAuction::INIT_SPACE,
        seeds = [COLLECTIONAUCTION_SEED, collection.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, CollectionAuction>,

    /// CHECK: an existing Core collection. mpl-core rejects the authority
    /// change unless `creator` is the current update authority, which is the
    /// same guarantee a constraint here would give without decoding Core's
    /// layout.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn list_collection_auction_handler(
    ctx: Context<ListCollectionAuction>,
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

    // Read the size before handing over authority — afterwards this instruction
    // no longer speaks for the collection, and the number is what the listing
    // is advertising.
    let size = collection_size(&ctx.accounts.collection.try_borrow_data()?)
        .ok_or(AttentionError::InvalidAuctionParams)?;

    UpdateCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.creator.to_account_info())
        .authority(Some(&ctx.accounts.creator.to_account_info()))
        .new_update_authority(Some(&ctx.accounts.auction.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .invoke()?;

    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;
    auction.collection = ctx.accounts.collection.key();
    auction.creator = ctx.accounts.creator.key();
    auction.start_price = start_price;
    auction.floor_price = floor_price;
    auction.start_time = now;
    auction.duration = duration;
    auction.complete = false;
    auction.bump = ctx.bumps.auction;

    emit!(CollectionListedEvent {
        collection: ctx.accounts.collection.key(),
        creator: ctx.accounts.creator.key(),
        size,
        start_price,
        floor_price,
        duration,
        timestamp: now,
    });
    Ok(())
}
