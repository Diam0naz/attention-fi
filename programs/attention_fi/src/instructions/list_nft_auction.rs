use anchor_lang::prelude::*;
use mpl_core::instructions::{AddPluginV1CpiBuilder, TransferV1CpiBuilder};
use mpl_core::types::{Attributes, Plugin, PluginAuthority};

use crate::constants::{GLOBAL_SEED, NFTAUCTION_SEED};
use crate::error::AttentionError;
use crate::events::NftListedEvent;
use crate::nft::has_attributes_plugin;
use crate::state::{Global, NftAuction};

/// List an NFT the caller already owns as a descending 1-of-1 auction.
///
/// `start_nft_auction` *mints* its asset (the asset account signs its own
/// creation), so it can only ever list something created in the same
/// transaction. That left every already-minted collectible — anything from
/// `mint_nft` — permanently unlistable. This takes an existing Core asset the
/// owner controls and escrows it under the auction PDA instead, so the rest of
/// the lifecycle (`buy_nft`, `reclaim_nft_auction`) works identically.
#[derive(Accounts)]
pub struct ListNftAuction<'info> {
    /// Current owner of the asset; must sign to hand it into escrow.
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

    /// CHECK: an existing Core asset. Ownership is enforced by mpl-core, which
    /// rejects the transfer unless `creator` is the current owner — the same
    /// guarantee an `owner =` constraint would give, without decoding Core's
    /// account layout here.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: optional collection the asset belongs to; mpl-core requires it be
    /// passed for a transfer when the asset is part of one.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn list_nft_auction_handler(
    ctx: Context<ListNftAuction>,
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

    // Move the asset into escrow. The owner signs directly here (unlike
    // buy_nft/reclaim, where the auction PDA signs to move it back out).
    // The builder borrows each account, so these must outlive it.
    let core_program = ctx.accounts.mpl_core_program.to_account_info();
    let asset_info = ctx.accounts.asset.to_account_info();
    let creator_info = ctx.accounts.creator.to_account_info();
    let auction_info = ctx.accounts.auction.to_account_info();
    let system_info = ctx.accounts.system_program.to_account_info();
    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|collection| collection.to_account_info());

    let mut transfer = TransferV1CpiBuilder::new(&core_program);
    transfer
        .asset(&asset_info)
        .payer(&creator_info)
        .authority(Some(&creator_info))
        .new_owner(&auction_info)
        .system_program(Some(&system_info));
    if let Some(collection) = &collection_info {
        transfer.collection(Some(collection));
    }
    transfer.invoke()?;

    // Delegate the Attributes plugin to the auction PDA so `buy_nft` can
    // record the clearing price on the asset itself.
    //
    // This has to happen here, not at sale time: Attributes is an
    // authority-managed plugin, and the seller — who holds update authority
    // over an asset they minted — is only a signer during this instruction.
    // The delegation is to the PDA derived from this asset, so it stays valid
    // for the listing's whole life and for any later relisting.
    //
    // An asset can be listed, sold and listed again, and AddPluginV1 fails
    // outright on a plugin that already exists. On that second pass the plugin
    // is already delegated to this same PDA, so there is nothing to do.
    if !has_attributes_plugin(&ctx.accounts.asset.try_borrow_data()?) {
        let mut add = AddPluginV1CpiBuilder::new(&core_program);
        add.asset(&asset_info)
            .payer(&creator_info)
            .authority(Some(&creator_info))
            .system_program(&system_info)
            .plugin(Plugin::Attributes(Attributes {
                attribute_list: vec![],
            }))
            .init_authority(PluginAuthority::Address {
                address: auction_info.key(),
            });
        if let Some(collection) = &collection_info {
            add.collection(Some(collection));
        }
        add.invoke()?;
    }

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
