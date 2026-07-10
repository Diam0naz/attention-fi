use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{Attribute, Attributes, DataState, Plugin, PluginAuthorityPair};

use crate::constants::{GENESIS_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::state::{GenesisNft, Global};

#[derive(Accounts)]
pub struct MintGenesis<'info> {
    /// Protocol keeper minting the genesis share to an early participant.
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: recipient/owner of the genesis NFT.
    pub recipient: UncheckedAccount<'info>,

    /// CHECK: the token mint whose fee stream this NFT shares (reference only).
    pub subject_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + GenesisNft::INIT_SPACE,
        seeds = [GENESIS_SEED, asset.key().as_ref()],
        bump,
    )]
    pub genesis: Account<'info, GenesisNft>,

    /// The new Core asset (client-generated keypair, signs its creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn mint_genesis_handler(ctx: Context<MintGenesis>, share_bps: u16, uri: String) -> Result<()> {
    require!(
        share_bps > 0 && share_bps <= 10_000,
        AttentionError::InvalidAuctionParams
    );

    let subject_mint = ctx.accounts.subject_mint.key();
    // Transferable (no freeze plugin) so the fee-share right can trade on secondary.
    let plugins = vec![PluginAuthorityPair {
        plugin: Plugin::Attributes(Attributes {
            attribute_list: vec![
                Attribute {
                    key: "kind".to_string(),
                    value: "genesis".to_string(),
                },
                Attribute {
                    key: "subject_mint".to_string(),
                    value: subject_mint.to_string(),
                },
                Attribute {
                    key: "share_bps".to_string(),
                    value: share_bps.to_string(),
                },
            ],
        }),
        authority: None,
    }];

    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.authority.to_account_info())
        .owner(Some(&ctx.accounts.recipient.to_account_info()))
        .update_authority(Some(&ctx.accounts.authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .data_state(DataState::AccountState)
        .name("AttentionFi Genesis".to_string())
        .uri(uri)
        .plugins(plugins)
        .invoke()?;

    let genesis = &mut ctx.accounts.genesis;
    genesis.asset = ctx.accounts.asset.key();
    genesis.owner = ctx.accounts.recipient.key();
    genesis.subject_mint = subject_mint;
    genesis.share_bps = share_bps;
    genesis.bump = ctx.bumps.genesis;

    Ok(())
}
