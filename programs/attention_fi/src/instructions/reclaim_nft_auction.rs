use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1CpiBuilder;

use crate::auction::is_perpetual;
use crate::constants::NFTAUCTION_SEED;
use crate::error::AttentionError;
use crate::events::{NftAuctionEvent, NFT_RECLAIMED};
use crate::state::NftAuction;

/// Return an unsold 1-of-1 to its lister — on demand for the lister, or once
/// the window has closed for anyone else.
///
/// `start_nft_auction` mints the asset owned by the auction PDA, and `buy_nft`
/// is the only way out — but it refuses once `start_time + duration` has
/// elapsed. Without this instruction an auction that ends without a buyer locks
/// the NFT in escrow permanently: nobody can buy it and nobody can retrieve it.
/// This is the NFT counterpart to `settle_auction` on the token side.
///
/// The lister may pull a live listing early, which also makes this the delist
/// path. That's safe on a descending auction specifically because there are no
/// bids to cancel: a buyer either paid the current price and owns it already,
/// or has committed nothing. Someone who listed for thirty days otherwise had
/// no way out for thirty days.
///
/// Everyone else still has to wait for expiry, so an early reclaim can only
/// ever be the seller's own decision.
#[derive(Accounts)]
pub struct ReclaimNftAuction<'info> {
    /// Pays the transaction. Reclaiming is permissionless — the asset can only
    /// ever go back to `auction.creator`, so anyone may trigger the return
    /// (a keeper, or the lister themselves).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: recipient of the returned asset; bound to the auction's lister.
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

    /// The asset's collection when it is a collection member: Core refuses to
    /// move a member without it. Optional and last, so a client that omits it
    /// keeps working for standalone assets.
    ///
    /// CHECK: mpl-core validates it against the asset's update authority.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,
}

pub fn reclaim_nft_auction_handler(ctx: Context<ReclaimNftAuction>) -> Result<()> {
    // A sold auction has already transferred the asset; nothing to reclaim.
    require!(!ctx.accounts.auction.complete, AttentionError::SoldOut);

    let auction = &ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;
    // For anyone but the lister this is the inverted mirror of buy_nft's
    // window: reclaiming is only legal once buying is not, so a keeper can
    // never race a buyer for the asset. The lister is exempt — pulling their
    // own listing early is a delist, and the worst it can do is deny a sale
    // that hadn't happened.
    if ctx.accounts.payer.key() != auction.creator {
        // A perpetual listing never expires, so this path never opens for
        // anyone but the lister. Without the is_perpetual guard the arithmetic
        // says otherwise and says it immediately: duration is zero, so
        // `now >= start_time` is true from the moment of listing, and any
        // passer-by could yank a live listing out from under its owner.
        require!(
            !is_perpetual(auction.duration),
            AttentionError::AuctionNotEnded
        );
        require!(
            now >= auction.start_time + auction.duration,
            AttentionError::AuctionNotEnded
        );
    }

    // Return the escrowed NFT to its lister; the auction PDA (owner) signs.
    let asset_key = ctx.accounts.asset.key();
    let signer_seeds: &[&[&[u8]]] = &[&[NFTAUCTION_SEED, asset_key.as_ref(), &[auction.bump]]];
    let collection_info = ctx.accounts.collection.as_ref().map(|c| c.to_account_info());
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(collection_info.as_ref())
        .payer(&ctx.accounts.payer.to_account_info())
        .authority(Some(&ctx.accounts.auction.to_account_info()))
        .new_owner(&ctx.accounts.creator.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer_seeds)?;

    // Close the auction so the asset can't be reclaimed twice.
    ctx.accounts.auction.complete = true;

    emit!(NftAuctionEvent {
        asset: asset_key,
        creator: ctx.accounts.creator.key(),
        counterparty: ctx.accounts.creator.key(),
        outcome: NFT_RECLAIMED,
        price: 0,
        fee: 0,
        timestamp: now,
    });
    Ok(())
}
