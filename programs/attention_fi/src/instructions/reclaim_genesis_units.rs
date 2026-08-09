use anchor_lang::prelude::*;
use mpl_core::accounts::BaseAssetV1;
use mpl_core::instructions::TransferV1CpiBuilder;
// `Key` is referenced by its full path below: mpl-core's asset-kind enum shares
// a name with Anchor's `Key` trait, and importing it here takes `.key()` away
// from every account in this file.
use mpl_core::types::UpdateAuthority;

use crate::constants::GENGROUP_SEED;
use crate::error::AttentionError;
use crate::events::GenesisUnitsReclaimedEvent;
use crate::genesis::record_reclaim;
use crate::state::GenesisGroup;

/// Take unsold units back out of a genesis group's escrow.
///
/// Without this a listing was a one-way door. `mint_genesis_batch` mints every
/// unit into an escrow only `buy_genesis_unit` can empty, so a run that never
/// sold out left the creator's own NFTs — and the rent paid for them — beyond
/// reach permanently. A listing that can strand assets is not a listing, it is
/// a trap with a price on it.
///
/// Only what is still escrowed can come back: a sold unit belongs to its buyer,
/// and the ownership check below is what enforces that rather than the count
/// alone. `minted_units` comes down by however many are returned, so the group
/// keeps describing what it actually holds.
///
/// The units arrive as remaining accounts for the same reason they do when
/// minting — there are N of them and an Anchor account struct is fixed-width.
#[derive(Accounts)]
pub struct ReclaimGenesisUnits<'info> {
    /// The group's creator, and the only wallet its escrow answers to.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: bound by the group's `has_one`; only used to derive its PDA.
    pub subject_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [GENGROUP_SEED, subject_mint.key().as_ref()],
        bump = group.bump,
        has_one = subject_mint,
        has_one = creator @ AttentionError::Unauthorized,
        has_one = collection,
    )]
    pub group: Account<'info, GenesisGroup>,

    /// CHECK: the group's collection; bound by `group.has_one = collection`.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn reclaim_genesis_units_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ReclaimGenesisUnits<'info>>,
) -> Result<()> {
    let units = ctx.remaining_accounts;
    let minted_after = record_reclaim(
        ctx.accounts.group.minted_units,
        ctx.accounts.group.sold_units,
        units.len(),
    )?;

    let subject_mint = ctx.accounts.subject_mint.key();
    let group_key = ctx.accounts.group.key();
    let collection_key = ctx.accounts.group.collection;

    let core_program = ctx.accounts.mpl_core_program.to_account_info();
    let creator = ctx.accounts.creator.to_account_info();
    let collection = ctx.accounts.collection.to_account_info();
    let group = ctx.accounts.group.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();

    let signer_seeds: &[&[&[u8]]] = &[&[
        GENGROUP_SEED,
        subject_mint.as_ref(),
        &[ctx.accounts.group.bump],
    ]];

    for asset in units {
        // Checked here rather than left to mpl-core, which would reject a
        // foreign asset for the right reason but the wrong count: the tally
        // above has already been reduced, and a transfer that succeeds against
        // something that was never a unit of this run would leave the group
        // claiming fewer units than it holds.
        let record = {
            let data = asset.try_borrow_data()?;
            BaseAssetV1::from_bytes(&data).map_err(|_| AttentionError::AssetNotInGroup)?
        };
        require!(
            record.key == mpl_core::types::Key::AssetV1,
            AttentionError::AssetNotInGroup
        );
        require!(record.owner == group_key, AttentionError::AssetNotInGroup);
        let UpdateAuthority::Collection(asset_collection) = record.update_authority else {
            return err!(AttentionError::AssetNotInGroup);
        };
        require!(
            asset_collection == collection_key,
            AttentionError::AssetNotInGroup
        );

        TransferV1CpiBuilder::new(&core_program)
            .asset(asset)
            .collection(Some(&collection))
            .payer(&creator)
            .authority(Some(&group))
            .new_owner(&creator)
            .system_program(Some(&system_program))
            .invoke_signed(signer_seeds)?;
    }

    let reclaimed = u16::try_from(units.len()).map_err(|_| AttentionError::InvalidGenesisBatch)?;
    ctx.accounts.group.minted_units = minted_after;

    emit!(GenesisUnitsReclaimedEvent {
        subject_mint,
        creator: ctx.accounts.creator.key(),
        units: reclaimed,
        minted_units: minted_after,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
