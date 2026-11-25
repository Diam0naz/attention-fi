use anchor_lang::prelude::*;
use anchor_lang::system_program;
use mpl_core::instructions::{TransferV1CpiBuilder, UpdatePluginV1CpiBuilder};
use mpl_core::types::Plugin;

use crate::auction::{current_price, is_perpetual};
use crate::constants::FEATUREGATE_SEED;
use crate::constants::{FEECONFIG_SEED, GLOBAL_SEED, GUARDIANS_SEED, NFTAUCTION_SEED};
use crate::error::AttentionError;
use crate::events::{NftAuctionEvent, NFT_SOLD};
use crate::features::{self, FEATURE_NFT};
use crate::guardians;
use crate::nft::{has_attributes_plugin, last_sale_attributes};
use crate::state::{FeeConfig, Global, NftAuction};

#[derive(Accounts)]
pub struct BuyNft<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// The NFT market's own fee, which is not the curve's trading fee.
    #[account(seeds = [FEECONFIG_SEED], bump = fee_config.bump)]
    pub fee_config: Account<'info, FeeConfig>,

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

    /// The emergency stop.
    ///
    /// Required, never optional: an optional stop is not a stop — omitting it
    /// would help the caller, which is exactly the shape that made the genesis
    /// pool exploitable. Unchecked because an empty account is the legitimate
    /// "no guardian set installed yet" state rather than an error.
    ///
    /// CHECK: seeds pin the address; `guardians::require_live` validates it.
    #[account(seeds = [GUARDIANS_SEED], bump)]
    pub guardians: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,

    /// The asset's collection when it is a collection member: Core refuses to
    /// move a member without it. Optional and last, so a client that omits it
    /// keeps working for standalone assets.
    ///
    /// CHECK: mpl-core validates it against the asset's update authority.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,
}

pub fn buy_nft_handler(ctx: Context<BuyNft>, max_total: u64) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_NFT)?;
    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(!ctx.accounts.auction.complete, AttentionError::SoldOut);

    let auction = &ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;
    // A perpetual listing has no deadline to be past; a timed one does.
    if !is_perpetual(auction.duration) {
        require!(
            now < auction.start_time + auction.duration,
            AttentionError::AuctionEnded
        );
    }

    let price = current_price(
        auction.start_price,
        auction.floor_price,
        auction.start_time,
        auction.duration,
        now,
    )?;

    let fee = u128::from(price)
        .checked_mul(u128::from(ctx.accounts.fee_config.nft_fee_bps))
        .and_then(|product| product.checked_div(10_000))
        .ok_or(AttentionError::MathOverflow)?;
    let fee = u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?;
    // The ceiling covers what actually leaves the buyer's wallet. The fee is
    // charged on top of the price and its rate is tunable between signing and
    // landing, so a guard on the price alone bounded the wrong number — the
    // buyer authorised one figure and could be debited a larger one.
    let total = price.checked_add(fee).ok_or(AttentionError::MathOverflow)?;
    require!(total <= max_total, AttentionError::CostAboveMax);

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

    let asset_key = ctx.accounts.asset.key();
    let signer_seeds: &[&[&[u8]]] = &[&[NFTAUCTION_SEED, asset_key.as_ref(), &[auction.bump]]];

    // Record what it sold for, on the asset itself.
    //
    // Written before the transfer, not after: the auction PDA's claim on this
    // asset — as owner, and as the plugin's authority — is at its strongest
    // while the asset is still escrowed. Doing it afterwards would depend on a
    // delegation surviving a change of owner.
    //
    // Skipped when the asset has no Attributes plugin, rather than assumed.
    //
    // `start_nft_auction` mints with the plugin and `list_nft_auction` adds it,
    // so every listing made under the current program has one — but listings
    // made before that shipped do not, and this used to update unconditionally.
    // mpl-core answers PluginNotFound, the whole instruction unwinds, and a
    // perfectly valid sale becomes impossible: the buyer's wallet just declines,
    // forever, for a reason nothing on screen could explain.
    //
    // The plugin also can't be added here to compensate. Attributes is
    // authority-managed and the asset's update authority is the seller, who
    // isn't a signer in this instruction — only the lister can grant it, which
    // is exactly why `list_nft_auction` does.
    //
    // So the annotation degrades instead of blocking. It is a convenience for
    // wallets and marketplaces that have never heard of AttentionFi; the
    // authoritative price is in NftAuctionEvent either way. A missing nicety
    // must never cost someone a sale.
    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|c| c.to_account_info());
    if has_attributes_plugin(&ctx.accounts.asset.try_borrow_data()?) {
        UpdatePluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(collection_info.as_ref())
            .payer(&ctx.accounts.buyer.to_account_info())
            .authority(Some(&ctx.accounts.auction.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .plugin(Plugin::Attributes(last_sale_attributes(price, now)))
            .invoke_signed(signer_seeds)?;
    }

    // Transfer the escrowed NFT to the buyer; auction PDA (owner) signs.
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(collection_info.as_ref())
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
