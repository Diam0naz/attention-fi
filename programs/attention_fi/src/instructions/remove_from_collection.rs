use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateV2CpiBuilder;
use mpl_core::types::UpdateAuthority;

/// Take an asset out of a collection, handing update authority back to the
/// caller — the inverse of [`add_to_collection`](super::add_to_collection).
///
/// Needed in its own right and as a prerequisite: Core refuses to burn a
/// collection that still has members (`CollectionMustBeEmpty`), so emptying is
/// the step before deleting rather than a separate convenience.
///
/// mpl-core enforces that the caller holds authority over the collection the
/// asset is leaving, which is what stops anyone pulling assets out of someone
/// else's.
#[derive(Accounts)]
pub struct RemoveFromCollection<'info> {
    /// Authority over the collection, and the asset's update authority after.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: the Core asset to remove; mpl-core validates authority.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: the collection it currently belongs to; mpl-core validates the
    /// payer's authority over it.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn remove_from_collection_handler(ctx: Context<RemoveFromCollection>) -> Result<()> {
    let payer = ctx.accounts.payer.to_account_info();
    let asset = ctx.accounts.asset.to_account_info();
    let collection = ctx.accounts.collection.to_account_info();

    UpdateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&asset)
        .collection(Some(&collection))
        .payer(&payer)
        .authority(Some(&payer))
        .system_program(&ctx.accounts.system_program.to_account_info())
        // Standalone again, under the caller rather than the collection.
        .new_update_authority(UpdateAuthority::Address(ctx.accounts.payer.key()))
        .invoke()?;

    Ok(())
}
