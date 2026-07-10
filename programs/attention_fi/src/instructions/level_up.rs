use anchor_lang::prelude::*;
use mpl_core::instructions::UpdatePluginV1CpiBuilder;
use mpl_core::types::Plugin;

use crate::constants::{GLOBAL_SEED, MAX_PERK_LEVEL, PERK_AUTH_SEED, PERK_SEED};
use crate::error::AttentionError;
use crate::nft::{perk_attributes, perk_discount_bps};
use crate::state::{Global, PerkNft};

#[derive(Accounts)]
pub struct LevelUp<'info> {
    /// Protocol keeper triggering the level-up (e.g. on volume milestones).
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: program-owned update authority for perk assets; signs the plugin
    /// update via seeds. Validated by seeds.
    #[account(seeds = [PERK_AUTH_SEED], bump)]
    pub perk_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PERK_SEED, asset.key().as_ref()],
        bump = perk.bump,
        has_one = asset,
    )]
    pub perk: Account<'info, PerkNft>,

    /// CHECK: the Core asset to update; bound by `perk.has_one = asset`.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn level_up_handler(ctx: Context<LevelUp>) -> Result<()> {
    require!(
        ctx.accounts.perk.level < MAX_PERK_LEVEL,
        AttentionError::MaxLevelReached
    );
    let new_level = ctx.accounts.perk.level + 1;

    // Rewrite the asset's Attributes, signed by the program's perk authority PDA.
    let auth_bump = ctx.bumps.perk_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[PERK_AUTH_SEED, &[auth_bump]]];
    UpdatePluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.authority.to_account_info())
        .authority(Some(&ctx.accounts.perk_authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::Attributes(perk_attributes(new_level)))
        .invoke_signed(signer_seeds)?;

    let perk = &mut ctx.accounts.perk;
    perk.level = new_level;
    perk.discount_bps = perk_discount_bps(new_level);

    Ok(())
}
