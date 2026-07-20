use anchor_lang::prelude::*;
use mpl_core::instructions::CreateCollectionV2CpiBuilder;

use crate::error::AttentionError;

/// Create a Metaplex Core collection owned by the payer. The payer keeps the
/// collection's update authority, so they can mint new assets into it
/// (`mint_nft` with a `collection`) or gather existing assets they control
/// into it later (`add_to_collection`).
#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The new Core collection (client-generated keypair, signs its creation).
    #[account(mut)]
    pub collection: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_collection_handler(
    ctx: Context<CreateCollection>,
    name: String,
    uri: String,
) -> Result<()> {
    require!(
        !name.is_empty() && name.len() <= 64,
        AttentionError::InvalidAuctionParams
    );
    require!(uri.len() <= 200, AttentionError::InvalidAuctionParams);

    CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.payer.to_account_info())
        .update_authority(Some(&ctx.accounts.payer.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri(uri)
        .invoke()?;

    Ok(())
}
