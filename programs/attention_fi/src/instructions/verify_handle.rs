use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{
    Attribute, Attributes, DataState, PermanentFreezeDelegate, Plugin, PluginAuthorityPair,
};

use crate::constants::{GLOBAL_SEED, VERIFY_SEED};
use crate::error::AttentionError;
use crate::state::{Global, Verification};

/// Max handle length that fits the `Verification` account and the NFT name.
const MAX_HANDLE_LEN: usize = 32;

#[derive(Accounts)]
pub struct VerifyHandle<'info> {
    /// Protocol keeper attesting the handle↔wallet match. Trusted until SAS.
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: the wallet being credited with the soulbound credential.
    pub subject: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Verification::INIT_SPACE,
        seeds = [VERIFY_SEED, subject.key().as_ref()],
        bump,
    )]
    pub verification: Account<'info, Verification>,

    /// The new Core asset (client-generated keypair, signs its own creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn verify_handle_handler(
    ctx: Context<VerifyHandle>,
    handle: String,
    uri: String,
) -> Result<()> {
    require!(
        !handle.is_empty() && handle.len() <= MAX_HANDLE_LEN,
        AttentionError::InvalidHandle
    );

    // Soulbound: a permanent freeze plugin set at creation makes the asset
    // non-transferable forever. Attributes carry the verified handle on-chain.
    let plugins = vec![
        PluginAuthorityPair {
            plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
            authority: None,
        },
        PluginAuthorityPair {
            plugin: Plugin::Attributes(Attributes {
                attribute_list: vec![
                    Attribute {
                        key: "handle".to_string(),
                        value: handle.clone(),
                    },
                    Attribute {
                        key: "kind".to_string(),
                        value: "verification".to_string(),
                    },
                ],
            }),
            authority: None,
        },
    ];

    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.authority.to_account_info())
        .owner(Some(&ctx.accounts.subject.to_account_info()))
        .authority(Some(&ctx.accounts.authority.to_account_info()))
        .update_authority(Some(&ctx.accounts.authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .data_state(DataState::AccountState)
        .name(format!("@{handle} · verified"))
        .uri(uri)
        .plugins(plugins)
        .invoke()?;

    let now = Clock::get()?.unix_timestamp;
    let verification = &mut ctx.accounts.verification;
    verification.subject = ctx.accounts.subject.key();
    verification.asset = ctx.accounts.asset.key();
    verification.handle = handle;
    verification.verified_at = now;
    verification.bump = ctx.bumps.verification;

    Ok(())
}
