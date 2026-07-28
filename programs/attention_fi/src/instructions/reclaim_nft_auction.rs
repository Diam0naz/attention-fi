use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1CpiBuilder;

use crate::constants::NFTAUCTION_SEED;
use crate::error::AttentionError;
use crate::state::NftAuction;

/// Return an unsold 1-of-1 to its lister once the auction window has closed.
///
/// `start_nft_auction` mints the asset owned by the auction PDA, and `buy_nft`
/// is the only way out — but it refuses once `start_time + duration` has
/// elapsed. Without this instruction an auction that ends without a buyer locks
/// the NFT in escrow permanently: nobody can buy it and nobody can retrieve it.
/// This is the NFT counterpart to `settle_auction` on the token side.
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
}

pub fn reclaim_nft_auction_handler(ctx: Context<ReclaimNftAuction>) -> Result<()> {
    // A sold auction has already transferred the asset; nothing to reclaim.
    require!(!ctx.accounts.auction.complete, AttentionError::SoldOut);

    let auction = &ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;
    // Mirror of buy_nft's window, inverted: reclaiming is only legal once
    // buying is not, so the two paths can never both be open.
    require!(
        now >= auction.start_time + auction.duration,
        AttentionError::AuctionNotEnded
    );

    // Return the escrowed NFT to its lister; the auction PDA (owner) signs.
    let asset_key = ctx.accounts.asset.key();
    let signer_seeds: &[&[&[u8]]] = &[&[NFTAUCTION_SEED, asset_key.as_ref(), &[auction.bump]]];
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.payer.to_account_info())
        .authority(Some(&ctx.accounts.auction.to_account_info()))
        .new_owner(&ctx.accounts.creator.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer_seeds)?;

    // Close the auction so the asset can't be reclaimed twice.
    ctx.accounts.auction.complete = true;
    Ok(())
}
