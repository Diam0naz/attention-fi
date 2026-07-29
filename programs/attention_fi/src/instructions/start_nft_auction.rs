use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::DataState;

use crate::constants::{GLOBAL_SEED, NFTAUCTION_SEED};
use crate::error::AttentionError;
use crate::events::NftListedEvent;
use crate::state::{Global, NftAuction};

#[derive(Accounts)]
pub struct StartNftAuction<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init,
        payer = creator,
        space = 8 + NftAuction::INIT_SPACE,
        seeds = [NFTAUCTION_SEED, asset.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, NftAuction>,

    /// The new 1-of-1 Core asset (client-generated keypair, signs its creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn start_nft_auction_handler(
    ctx: Context<StartNftAuction>,
    start_price: u64,
    floor_price: u64,
    duration: i64,
    name: String,
    uri: String,
) -> Result<()> {
    require!(
        start_price >= floor_price,
        AttentionError::InvalidAuctionParams
    );
    require!(floor_price > 0, AttentionError::InvalidAuctionParams);
    require!(duration > 0, AttentionError::InvalidAuctionParams);

    // Mint the NFT owned by the auction PDA (escrow); it signs the transfer on sale.
    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.creator.to_account_info())
        .owner(Some(&ctx.accounts.auction.to_account_info()))
        .update_authority(Some(&ctx.accounts.auction.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .data_state(DataState::AccountState)
        .name(name)
        .uri(uri)
        .invoke()?;

    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;
    auction.asset = ctx.accounts.asset.key();
    auction.creator = ctx.accounts.creator.key();
    auction.start_price = start_price;
    auction.floor_price = floor_price;
    auction.start_time = now;
    auction.duration = duration;
    auction.complete = false;
    auction.bump = ctx.bumps.auction;

    emit!(NftListedEvent {
        asset: ctx.accounts.asset.key(),
        creator: ctx.accounts.creator.key(),
        start_price,
        floor_price,
        duration,
        timestamp: now,
    });
    Ok(())
}
