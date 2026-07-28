use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{DataState, PermanentFreezeDelegate, Plugin, PluginAuthorityPair};

use crate::constants::{PERKGRANT_SEED, PERK_AUTH_SEED, PERK_SEED};
use crate::nft::{perk_attributes, perk_discount_bps};
use crate::state::{PerkGrant, PerkNft};

/// Claim a perk the protocol has already authorised via `grant_perk`.
///
/// The claimant signs and pays here, so awarding perks costs the protocol only
/// the small grant record rather than a full Core asset per recipient. Minting
/// is still not open: without a matching `PerkGrant` there is no account to
/// close and the instruction cannot run, so a wallet can't mint itself a
/// discount.
#[derive(Accounts)]
pub struct ClaimPerk<'info> {
    /// The granted wallet. Signs and funds its own asset.
    #[account(mut)]
    pub recipient: Signer<'info>,

    /// The authorisation, consumed by this claim. `has_one = recipient` binds
    /// it to the signer, so one wallet can't spend another's grant.
    #[account(
        mut,
        seeds = [PERKGRANT_SEED, recipient.key().as_ref()],
        bump = grant.bump,
        has_one = recipient,
        close = granter,
    )]
    pub grant: Account<'info, PerkGrant>,

    /// CHECK: rent refund target for the closed grant; bound to the account
    /// that actually paid to create it.
    #[account(mut, address = grant.granter)]
    pub granter: UncheckedAccount<'info>,

    /// CHECK: program-owned update authority for all perk assets, so only the
    /// program can level the NFT up later. Validated by seeds.
    #[account(seeds = [PERK_AUTH_SEED], bump)]
    pub perk_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = recipient,
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

pub fn claim_perk_handler(ctx: Context<ClaimPerk>, uri: String) -> Result<()> {
    let level = ctx.accounts.grant.level;

    // Same plugin set as mint_perk: frozen so the discount can't be sold to a
    // higher-volume wallet, and Attributes owned by the program's PDA so the
    // holder can't rewrite their own discount.
    let plugins = vec![
        PluginAuthorityPair {
            plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
            authority: None,
        },
        PluginAuthorityPair {
            plugin: Plugin::Attributes(perk_attributes(level)),
            authority: None,
        },
    ];

    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.recipient.to_account_info())
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
