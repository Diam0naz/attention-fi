use anchor_lang::prelude::*;
use anchor_lang::system_program;
use mpl_core::instructions::{
    AddCollectionPluginV1CpiBuilder, UpdateCollectionPluginV1CpiBuilder,
    UpdateCollectionV1CpiBuilder,
};
use mpl_core::types::{Plugin, PluginAuthority};

use crate::auction::{current_price, is_perpetual};
use crate::constants::{COLLECTIONAUCTION_SEED, FEECONFIG_SEED, GLOBAL_SEED, GUARDIANS_SEED};
use crate::error::AttentionError;
use crate::events::{CollectionAuctionEvent, NFT_SOLD};
use crate::guardians;
use crate::nft::{collection_has_attributes, last_sale_attributes, move_collection_members};
use crate::state::{CollectionAuction, FeeConfig, Global};

/// Buy a listed collection at its current descending price.
///
/// Mirrors `buy_nft`, with the structural difference that defines the whole
/// collection lifecycle: a collection has no owner to transfer, only an update
/// authority to reassign. That reassignment alone was once thought to hand over
/// every member, since each asset names the collection as its authority — it
/// does not. `owner` is a separate field, and a buyer who got only the
/// authority got a deck whose cards were still the seller's to sell again. So
/// the members escrowed at listing are transferred here too, in
/// `remaining_accounts`, and the buyer must pass all of them.
///
/// The sale price is recorded on the collection's own Attributes plugin — one
/// write, not one per member, because a collection carries its own plugin
/// registry. Members keep whatever `last_sale` they earned individually.
#[derive(Accounts)]
pub struct BuyCollection<'info> {
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
}

pub fn buy_collection_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, BuyCollection<'info>>,
    max_total: u64,
) -> Result<()> {
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

    let collection_key = ctx.accounts.collection.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        COLLECTIONAUCTION_SEED,
        collection_key.as_ref(),
        &[auction.bump],
    ]];

    // Record what the collection sold for, on the collection itself.
    //
    // A collection carries its own plugin registry, so this is one write
    // rather than one per member — the reason a collection can have a last
    // sale price at all without the cost growing with its size. Members are
    // untouched, which is also correct: a member's own `last_sale` should mean
    // what that piece fetched on its own.
    //
    // Add or update depending on what's there. Unlike the asset path there's
    // no need to arrange authority in advance, because the escrow PDA is the
    // collection's update authority for exactly as long as this instruction
    // runs — it hasn't handed it to the buyer yet.
    let core_program = ctx.accounts.mpl_core_program.to_account_info();
    let collection_info = ctx.accounts.collection.to_account_info();
    let buyer_info = ctx.accounts.buyer.to_account_info();
    let auction_info = ctx.accounts.auction.to_account_info();
    let system_info = ctx.accounts.system_program.to_account_info();
    let sale = Plugin::Attributes(last_sale_attributes(price, now));

    if collection_has_attributes(&collection_info) {
        UpdateCollectionPluginV1CpiBuilder::new(&core_program)
            .collection(&collection_info)
            .payer(&buyer_info)
            .authority(Some(&auction_info))
            .system_program(&system_info)
            .plugin(sale)
            .invoke_signed(signer_seeds)?;
    } else {
        AddCollectionPluginV1CpiBuilder::new(&core_program)
            .collection(&collection_info)
            .payer(&buyer_info)
            .authority(Some(&auction_info))
            .system_program(&system_info)
            .plugin(sale)
            // Left with the update authority, which is about to become the
            // buyer — so a future sale by them can rewrite it.
            .init_authority(PluginAuthority::UpdateAuthority)
            .invoke_signed(signer_seeds)?;
    }

    // Hand over the cards themselves, then the collection.
    //
    // Both are needed and neither is sufficient: the collection carries the
    // right to mint into it and edit it, the members are the things of value.
    // Transferring only the authority is what let a seller keep a sold deck.
    // The escrow PDA signs as their owner, having held them since the listing.
    move_collection_members(
        ctx.remaining_accounts,
        &ctx.accounts.collection.to_account_info(),
        &ctx.accounts.auction.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        Some(signer_seeds),
    )?;

    // Hand the collection to the buyer; the escrow PDA signs as the current
    // update authority.
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
