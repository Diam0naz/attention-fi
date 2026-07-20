use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateV2CpiBuilder;
use mpl_core::types::UpdateAuthority;

/// Move a Core asset the payer controls into one of their collections —
/// "gather collected and earned NFTs into a new collection". mpl-core
/// enforces that the payer is the asset's update authority and holds
/// authority over the destination collection; soulbound credential NFTs
/// (update authority = a program PDA) are rejected there by design.
#[derive(Accounts)]
pub struct AddToCollection<'info> {
    /// Update authority of the asset and authority of the destination collection.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: the Core asset to move; mpl-core validates authority.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: the collection the asset currently belongs to, if any;
    /// mpl-core validates it against the asset's update authority.
    #[account(mut)]
    pub current_collection: Option<UncheckedAccount<'info>>,

    /// CHECK: the destination Core collection; mpl-core validates the
    /// payer's authority over it.
    #[account(mut)]
    pub new_collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_collection_handler(ctx: Context<AddToCollection>) -> Result<()> {
    let payer = ctx.accounts.payer.to_account_info();
    let asset = ctx.accounts.asset.to_account_info();
    let new_collection = ctx.accounts.new_collection.to_account_info();
    let current_collection = ctx
        .accounts
        .current_collection
        .as_ref()
        .map(|c| c.to_account_info());

    UpdateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&asset)
        .collection(current_collection.as_ref())
        .new_collection(Some(&new_collection))
        .payer(&payer)
        .authority(Some(&payer))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .new_update_authority(UpdateAuthority::Collection(
            ctx.accounts.new_collection.key(),
        ))
        .invoke()?;

    Ok(())
}
