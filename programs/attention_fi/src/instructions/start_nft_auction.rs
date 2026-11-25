use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{Attributes, DataState, Plugin, PluginAuthorityPair};

use crate::auction::validate_listing;
use crate::constants::FEATUREGATE_SEED;
use crate::constants::{GLOBAL_SEED, NFTAUCTION_SEED};
use crate::events::NftListedEvent;
use crate::features::{self, FEATURE_NFT};
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

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn start_nft_auction_handler(
    ctx: Context<StartNftAuction>,
    start_price: u64,
    floor_price: u64,
    duration: i64,
    name: String,
    uri: String,
) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_NFT)?;
    validate_listing(start_price, floor_price, duration)?;

    // An empty Attributes plugin, so `buy_nft` has somewhere to record the
    // clearing price. Added here rather than at sale time because AddPluginV1
    // is authority-managed: the auction PDA is this asset's update authority
    // now, and after the sale it will not be.
    //
    // `authority: None` leaves the plugin under the update authority, which is
    // that same PDA — derived from the asset, so it is stable across the
    // listing's whole life.
    let plugins = vec![PluginAuthorityPair {
        plugin: Plugin::Attributes(Attributes {
            attribute_list: vec![],
        }),
        authority: None,
    }];

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
        .plugins(plugins)
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
