use anchor_lang::prelude::*;
use mpl_core::instructions::BurnCollectionV1CpiBuilder;

/// Delete a collection the caller controls, returning its rent.
///
/// Core rejects this while the collection still has members
/// (`CollectionMustBeEmpty`), so it is the second half of a two-step retirement
/// — remove the assets, then delete the shell. That ordering is deliberate on
/// Core's part and worth preserving in the UI: an asset whose update authority
/// points at a burned collection would be orphaned, and the emptiness check is
/// what makes that unreachable.
///
/// Only the collection is destroyed. Its former members are ordinary
/// standalone assets by then, untouched by this.
#[derive(Accounts)]
pub struct BurnCollection<'info> {
    /// Authority over the collection, and where its rent is returned.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: the Core collection to burn; mpl-core validates authority and
    /// that it holds no assets.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn burn_collection_handler(ctx: Context<BurnCollection>) -> Result<()> {
    let authority = ctx.accounts.authority.to_account_info();
    let collection = ctx.accounts.collection.to_account_info();

    BurnCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&collection)
        .payer(&authority)
        .authority(Some(&authority))
        .invoke()?;

    Ok(())
}
