use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateCollectionV1CpiBuilder;

use crate::auction::validate_listing;
use crate::constants::{COLLECTIONAUCTION_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::CollectionListedEvent;
use crate::nft::{collection_size, move_collection_members};
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
/// The members do NOT travel with it implicitly, and assuming they did was a
/// real bug: an asset's `UpdateAuthority` pointing at the collection is a
/// separate field from its `owner`, so reassigning the collection handed the
/// buyer authority over cards that stayed in the seller's wallet — still theirs
/// to sell again, one by one. So every member is escrowed to this PDA here,
/// passed in `remaining_accounts`, and released to whoever the listing
/// resolves to. `size` is both the event's advertised count and the number of
/// members the instruction requires.
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

pub fn list_collection_auction_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ListCollectionAuction<'info>>,
    start_price: u64,
    floor_price: u64,
    duration: i64,
) -> Result<()> {
    validate_listing(start_price, floor_price, duration)?;

    // Read the size before handing over authority — afterwards this instruction
    // no longer speaks for the collection, and the number is what the listing
    // is advertising.
    let size = collection_size(&ctx.accounts.collection.try_borrow_data()?)
        .ok_or(AttentionError::InvalidAuctionParams)?;

    // Escrow the members BEFORE the authority moves. The seller signs these
    // transfers as their owner, and they are only the owner while they still
    // hold the collection — reversing the order would leave the assets behind
    // with nobody able to sign for them.
    move_collection_members(
        ctx.remaining_accounts,
        &ctx.accounts.collection.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
        &ctx.accounts.auction.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        None,
    )?;

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
