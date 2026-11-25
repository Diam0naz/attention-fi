use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{Attribute, Attributes, DataState, Plugin, PluginAuthorityPair};

use crate::constants::FEATUREGATE_SEED;
use crate::constants::{CURVE_SEED, GENESIS_SEED, GENPOOL_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::features::{self, FEATURE_NFT};
use crate::genesis::validate_added_share;
use crate::revenue::accrued;
use crate::state::{BondingCurve, GenesisNft, GenesisPool, Global};

#[derive(Accounts)]
pub struct MintGenesis<'info> {
    /// The subject token's creator, issuing genesis fee-share NFTs for it.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: recipient/owner of the genesis NFT.
    pub recipient: UncheckedAccount<'info>,

    /// CHECK: the token mint whose fee stream this NFT shares (reference only).
    pub subject_mint: UncheckedAccount<'info>,

    /// The subject token's bonding curve — gates issuance to its creator.
    #[account(
        seeds = [CURVE_SEED, subject_mint.key().as_ref()],
        bump = curve.bump,
        constraint = authority.key() == curve.creator @ AttentionError::Unauthorized,
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = authority,
        space = 8 + GenesisNft::INIT_SPACE,
        seeds = [GENESIS_SEED, asset.key().as_ref()],
        bump,
    )]
    pub genesis: Account<'info, GenesisNft>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + GenesisPool::INIT_SPACE,
        seeds = [GENPOOL_SEED, subject_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, GenesisPool>,

    /// The new Core asset (client-generated keypair, signs its creation).
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn mint_genesis_handler(ctx: Context<MintGenesis>, share_bps: u16, uri: String) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_NFT)?;
    // Bounded against what the token's stream already owes, not just against
    // 100% on its own. Per-NFT validation alone let a creator sell a run at a
    // stated percentage and then mint themselves enough shares to reduce the
    // buyers' cut to rounding error — taking their money and then taking back
    // what they bought.
    validate_added_share(ctx.accounts.pool.total_share_bps, share_bps)?;

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

    // Snapshot the accumulator so this NFT never claims fees deposited before it.
    let acc = ctx.accounts.pool.acc_per_share;

    let genesis = &mut ctx.accounts.genesis;
    genesis.asset = ctx.accounts.asset.key();
    genesis.owner = ctx.accounts.recipient.key();
    genesis.subject_mint = subject_mint;
    genesis.share_bps = share_bps;
    genesis.reward_debt = accrued(u64::from(share_bps), acc)?;
    genesis.unclaimed = 0;
    genesis.bump = ctx.bumps.genesis;

    let pool = &mut ctx.accounts.pool;
    pool.subject_mint = subject_mint;
    pool.total_share_bps = pool
        .total_share_bps
        .checked_add(u64::from(share_bps))
        .ok_or(AttentionError::MathOverflow)?;
    pool.bump = ctx.bumps.pool;

    Ok(())
}
