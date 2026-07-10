use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{DataState, Plugin, PluginAuthorityPair};

use crate::constants::{GLOBAL_SEED, PERK_AUTH_SEED, PERK_SEED};
use crate::error::AttentionError;
use crate::nft::{perk_attributes, perk_discount_bps};
use crate::state::{Global, PerkNft};

#[derive(Accounts)]
pub struct MintPerk<'info> {
    /// Protocol keeper minting the perk to a participant.
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: recipient/owner of the perk NFT.
    pub recipient: UncheckedAccount<'info>,

    /// CHECK: program-owned update authority for all perk assets (enables
    /// program-controlled level-ups). Validated by seeds.
    #[account(seeds = [PERK_AUTH_SEED], bump)]
    pub perk_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + PerkNft::INIT_SPACE,
        seeds = [PERK_SEED, asset.key().as_ref()],
        bump,
    )]
    pub perk: Account<'info, PerkNft>,

    /// The new Core asset (client-generated keypair, signs its creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn mint_perk_handler(ctx: Context<MintPerk>, uri: String) -> Result<()> {
    let level: u8 = 1;

    // Attributes controlled by the program's perk authority PDA, so only the
    // program can level the NFT up later.
    let plugins = vec![PluginAuthorityPair {
        plugin: Plugin::Attributes(perk_attributes(level)),
        authority: None,
    }];

    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.authority.to_account_info())
        .owner(Some(&ctx.accounts.recipient.to_account_info()))
        .update_authority(Some(&ctx.accounts.perk_authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .data_state(DataState::AccountState)
        .name("AttentionFi Perk".to_string())
        .uri(uri)
        .plugins(plugins)
        .invoke()?;

    let perk = &mut ctx.accounts.perk;
    perk.asset = ctx.accounts.asset.key();
    perk.owner = ctx.accounts.recipient.key();
    perk.level = level;
    perk.discount_bps = perk_discount_bps(level);
    perk.bump = ctx.bumps.perk;

    Ok(())
}
