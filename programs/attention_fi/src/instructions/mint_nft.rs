use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::DataState;

use crate::error::AttentionError;

/// Mint a plain Metaplex Core NFT (name + uri, no role/plugins) — a
/// collectible minted directly to the owner, standalone or straight into one
/// of the payer's collections.
#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: owner/recipient of the minted NFT.
    pub recipient: UncheckedAccount<'info>,

    /// The new Core asset (client-generated keypair, signs its creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: optional Core collection to mint into; mpl-core enforces that
    /// the payer holds its update authority.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn mint_nft_handler(ctx: Context<MintNft>, name: String, uri: String) -> Result<()> {
    require!(
        !name.is_empty() && name.len() <= 64,
        AttentionError::InvalidAuctionParams
    );
    require!(uri.len() <= 200, AttentionError::InvalidAuctionParams);

    let mpl_core_program = ctx.accounts.mpl_core_program.to_account_info();
    let payer = ctx.accounts.payer.to_account_info();
    let asset = ctx.accounts.asset.to_account_info();
    let recipient = ctx.accounts.recipient.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let collection = ctx
        .accounts
        .collection
        .as_ref()
        .map(|c| c.to_account_info());

    let mut create = CreateV2CpiBuilder::new(&mpl_core_program);
    create
        .asset(&asset)
        .payer(&payer)
        .owner(Some(&recipient))
        .system_program(&system_program)
        .data_state(DataState::AccountState)
        .name(name)
        .uri(uri);

    // Into a collection the asset inherits the collection's authority (the two
    // are mutually exclusive in mpl-core); standalone, the payer keeps it so
    // the asset can be gathered into a collection later.
    match collection.as_ref() {
        Some(col) => create.collection(Some(col)).authority(Some(&payer)),
        None => create.update_authority(Some(&payer)),
    };
    create.invoke()?;

    Ok(())
}
