use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateCollectionV1CpiBuilder;

use crate::constants::{CURVE_SEED, GENGROUP_SEED, GENPOOL_SEED};
use crate::error::AttentionError;
use crate::events::GenesisGroupListedEvent;
use crate::genesis::validate_group;
use crate::nft::collection_size;
use crate::state::{BondingCurve, GenesisGroup, GenesisPool};

/// Open a fixed-price run of genesis fee-share NFTs for a token.
///
/// Declares the terms — how many units, what each carries, what it costs, how
/// many one wallet may take — and escrows the collection's update authority
/// under the group PDA. The escrow is the whole point of listing before
/// minting: while the creator holds that authority they can mint into the
/// collection whenever they like, so `total_units` would be a promise rather
/// than a fact and every unit's share of the fee stream could be diluted after
/// it was sold. Handing the authority over costs the creator nothing they still
/// need — `mint_genesis_batch` mints on their behalf, up to the declared total.
///
/// The collection must be empty. A group's units are exactly what
/// `mint_genesis_batch` puts in it; pre-existing members are not owned by the
/// escrow, could never be sold as units, and would show up in every wallet and
/// marketplace as part of a run they aren't part of.
#[derive(Accounts)]
pub struct ListGenesisGroup<'info> {
    /// The subject token's creator — the only wallet that can sell a claim on
    /// its fee stream.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: the token whose fee stream the units share; used to key the group.
    pub subject_mint: UncheckedAccount<'info>,

    /// The subject token's bonding curve — gates issuance to its creator.
    #[account(
        seeds = [CURVE_SEED, subject_mint.key().as_ref()],
        bump = curve.bump,
        constraint = creator.key() == curve.creator @ AttentionError::Unauthorized,
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = creator,
        space = 8 + GenesisGroup::INIT_SPACE,
        seeds = [GENGROUP_SEED, subject_mint.key().as_ref()],
        bump,
    )]
    pub group: Account<'info, GenesisGroup>,

    /// Created here if the token has never issued a genesis NFT, so the group
    /// can be checked against — and later credited to — the same pool one-off
    /// `mint_genesis` NFTs use. A token has one fee stream, not one per
    /// issuance route.
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + GenesisPool::INIT_SPACE,
        seeds = [GENPOOL_SEED, subject_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, GenesisPool>,

    /// CHECK: an existing, empty Core collection. mpl-core rejects the authority
    /// change unless `creator` is its current update authority, which is the
    /// same guarantee a constraint here would give without decoding Core's
    /// layout.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn list_genesis_group_handler(
    ctx: Context<ListGenesisGroup>,
    total_units: u16,
    share_bps: u16,
    price: u64,
    per_wallet_cap: u16,
) -> Result<()> {
    validate_group(
        total_units,
        share_bps,
        per_wallet_cap,
        price,
        ctx.accounts.pool.total_share_bps,
    )?;

    let size = collection_size(&ctx.accounts.collection.try_borrow_data()?)
        .ok_or(AttentionError::InvalidGenesisGroup)?;
    require!(size == 0, AttentionError::InvalidGenesisGroup);

    UpdateCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.creator.to_account_info())
        .authority(Some(&ctx.accounts.creator.to_account_info()))
        .new_update_authority(Some(&ctx.accounts.group.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .invoke()?;

    let subject_mint = ctx.accounts.subject_mint.key();
    let now = Clock::get()?.unix_timestamp;

    let group = &mut ctx.accounts.group;
    group.subject_mint = subject_mint;
    group.creator = ctx.accounts.creator.key();
    group.collection = ctx.accounts.collection.key();
    group.price = price;
    group.share_bps = share_bps;
    group.total_units = total_units;
    group.minted_units = 0;
    group.sold_units = 0;
    group.per_wallet_cap = per_wallet_cap;
    group.bump = ctx.bumps.group;

    // Only meaningful on the init_if_needed path; harmless to rewrite with the
    // same value on an existing pool.
    let pool = &mut ctx.accounts.pool;
    pool.subject_mint = subject_mint;
    pool.bump = ctx.bumps.pool;

    emit!(GenesisGroupListedEvent {
        subject_mint,
        creator: ctx.accounts.creator.key(),
        collection: ctx.accounts.collection.key(),
        total_units,
        share_bps,
        price,
        per_wallet_cap,
        timestamp: now,
    });
    Ok(())
}
