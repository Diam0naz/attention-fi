use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateCollectionV1CpiBuilder;

use crate::constants::COLLECTIONAUCTION_SEED;
use crate::error::AttentionError;
use crate::events::{CollectionAuctionEvent, NFT_RECLAIMED};
use crate::state::CollectionAuction;

/// Return an unsold collection's update authority to its lister once the
/// window has closed.
///
/// The counterpart to `reclaim_nft_auction`, and load-bearing for the same
/// reason: `buy_collection` refuses after the deadline, so without this a
/// collection nobody bought would be stranded under the escrow PDA — the
/// seller unable to mint into it or change it, permanently, having sold
/// nothing.
///
/// Permissionless, like the NFT reclaim: authority can only ever go back to
/// `auction.creator`, so who pays the fee to trigger it doesn't matter.
#[derive(Accounts)]
pub struct ReclaimCollectionAuction<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: recipient of the returned authority; bound to the lister.
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

pub fn reclaim_collection_auction_handler(ctx: Context<ReclaimCollectionAuction>) -> Result<()> {
    // A sold listing has already handed the authority on; nothing to reclaim.
    require!(!ctx.accounts.auction.complete, AttentionError::SoldOut);

    let auction = &ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;
    // Inverted mirror of buy_collection's window, so buying and reclaiming can
    // never both be open.
    require!(
        now >= auction.start_time + auction.duration,
        AttentionError::AuctionNotEnded
    );

    let collection_key = ctx.accounts.collection.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        COLLECTIONAUCTION_SEED,
        collection_key.as_ref(),
        &[auction.bump],
    ]];
    UpdateCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.payer.to_account_info())
        .authority(Some(&ctx.accounts.auction.to_account_info()))
        .new_update_authority(Some(&ctx.accounts.creator.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .invoke_signed(signer_seeds)?;

    // Close the listing so the authority can't be reclaimed twice.
    ctx.accounts.auction.complete = true;

    emit!(CollectionAuctionEvent {
        collection: collection_key,
        creator: ctx.accounts.creator.key(),
        counterparty: ctx.accounts.creator.key(),
        outcome: NFT_RECLAIMED,
        price: 0,
        fee: 0,
        timestamp: now,
    });
    Ok(())
}
