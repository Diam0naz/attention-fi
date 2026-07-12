use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{
    Attribute, Attributes, DataState, PermanentFreezeDelegate, Plugin, PluginAuthorityPair,
};
use solana_attestation_service_client::accounts::Attestation;
use solana_attestation_service_client::programs::SOLANA_ATTESTATION_SERVICE_ID;

use crate::constants::{GLOBAL_SEED, VERIFY_SEED};
use crate::error::AttentionError;
use crate::state::{Global, Verification};

/// Max handle length that fits the `Verification` account and the NFT name.
const MAX_HANDLE_LEN: usize = 32;

#[derive(Accounts)]
pub struct VerifyHandle<'info> {
    /// Pays for the credential accounts. Can be anyone (subject or a relayer) —
    /// trust comes from the attestation, not from who submits the transaction.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: the wallet being verified; must equal the attestation's nonce.
    pub subject: UncheckedAccount<'info>,

    /// CHECK: the SAS attestation. Ownership is enforced here; its contents are
    /// validated in the handler.
    #[account(owner = SOLANA_ATTESTATION_SERVICE_ID @ AttentionError::InvalidAttestation)]
    pub attestation: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
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

    // Validate the Solana Attestation Service attestation. Trust now rests on a
    // persistent, revocable on-chain credential issued by the protocol's signer,
    // rather than on the keeper co-signing every verification transaction.
    let attestation = Attestation::from_bytes(&ctx.accounts.attestation.try_borrow_data()?)
        .map_err(|_| error!(AttentionError::InvalidAttestation))?;
    require_keys_eq!(
        attestation.signer,
        ctx.accounts.global.authority,
        AttentionError::Unauthorized
    );
    require_keys_eq!(
        attestation.nonce,
        ctx.accounts.subject.key(),
        AttentionError::InvalidAttestation
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        attestation.expiry == 0 || now <= attestation.expiry,
        AttentionError::AttestationExpired
    );
    // Bind the handle to the attestation: its data must contain the handle bytes.
    require!(
        attestation
            .data
            .windows(handle.len())
            .any(|window| window == handle.as_bytes()),
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
        .payer(&ctx.accounts.payer.to_account_info())
        .owner(Some(&ctx.accounts.subject.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .data_state(DataState::AccountState)
        .name(format!("@{handle} · verified"))
        .uri(uri)
        .plugins(plugins)
        .invoke()?;

    let verification = &mut ctx.accounts.verification;
    verification.subject = ctx.accounts.subject.key();
    verification.asset = ctx.accounts.asset.key();
    verification.handle = handle;
    verification.verified_at = now;
    verification.bump = ctx.bumps.verification;

    Ok(())
}
