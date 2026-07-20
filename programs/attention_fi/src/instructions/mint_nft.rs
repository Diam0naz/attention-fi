use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::DataState;

use crate::error::AttentionError;

/// Mint a plain, standalone Metaplex Core NFT (name + uri, no role/plugins) —
/// a collectible with an optional image, minted directly to the owner.
#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: owner/recipient of the minted NFT.
    pub recipient: UncheckedAccount<'info>,

    /// The new Core asset (client-generated keypair, signs its creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn mint_nft_handler(ctx: Context<MintNft>, name: String, uri: String) -> Result<()> {
    require!(!name.is_empty() && name.len() <= 64, AttentionError::InvalidAuctionParams);
    require!(uri.len() <= 200, AttentionError::InvalidAuctionParams);

    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.payer.to_account_info())
        .owner(Some(&ctx.accounts.recipient.to_account_info()))
        .update_authority(Some(&ctx.accounts.payer.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .data_state(DataState::AccountState)
        .name(name)
        .uri(uri)
        .invoke()?;

    Ok(())
}
