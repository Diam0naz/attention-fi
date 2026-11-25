use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{Attribute, Attributes, DataState, Plugin, PluginAuthorityPair};

use crate::constants::FEATUREGATE_SEED;
use crate::constants::GENGROUP_SEED;
use crate::error::AttentionError;
use crate::events::GenesisBatchMintedEvent;
use crate::features::{self, FEATURE_NFT};
use crate::genesis::record_mint;
use crate::state::GenesisGroup;

/// Mint units into a listed genesis group.
///
/// Each unit is a distinct Core asset in the group's collection, owned by the
/// group PDA until someone buys it — the same escrow-then-transfer shape
/// `start_nft_auction` uses, repeated. They are minted rather than pre-assigned
/// so a buyer receives a real asset with its own address and art, not a receipt.
///
/// The assets arrive as remaining accounts because there are N of them and
/// Anchor's account structs are fixed-width: mpl-core requires each new asset to
/// sign its own creation, so the client generates N keypairs and passes them
/// through. A batch is capped per call ([`crate::genesis::MAX_GENESIS_BATCH`]) —
/// each unit is a separate CPI, and a client should raise its compute limit for
/// anything past a handful. Calls stack until the declared total is reached, so
/// a large run is several transactions rather than one that cannot land.
///
/// The creator pays the rent for every unit up front. That is the deliberate
/// trade for units that exist before they are sold: a buyer can see exactly what
/// they are getting, and the collection's size is the run's size.
#[derive(Accounts)]
pub struct MintGenesisBatch<'info> {
    /// The group's creator, funding the assets.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: bound by the group's `has_one`; only used to derive its PDA.
    pub subject_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [GENGROUP_SEED, subject_mint.key().as_ref()],
        bump = group.bump,
        has_one = subject_mint,
        has_one = creator @ AttentionError::Unauthorized,
        has_one = collection,
    )]
    pub group: Account<'info, GenesisGroup>,

    /// CHECK: the group's collection; bound by `group.has_one = collection`.
    /// Its update authority is the group PDA, which signs the mints below.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

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

pub fn mint_genesis_batch_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, MintGenesisBatch<'info>>,
    uri: String,
) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_NFT)?;
    require!(uri.len() <= 200, AttentionError::InvalidGenesisGroup);

    let assets = ctx.remaining_accounts;
    let minted_after = record_mint(
        ctx.accounts.group.minted_units,
        ctx.accounts.group.total_units,
        assets.len(),
    )?;

    let subject_mint = ctx.accounts.subject_mint.key();
    let share_bps = ctx.accounts.group.share_bps;
    let first_unit = ctx.accounts.group.minted_units;

    let core_program = ctx.accounts.mpl_core_program.to_account_info();
    let creator = ctx.accounts.creator.to_account_info();
    let collection = ctx.accounts.collection.to_account_info();
    let group = ctx.accounts.group.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();

    let signer_seeds: &[&[&[u8]]] = &[&[
        GENGROUP_SEED,
        subject_mint.as_ref(),
        &[ctx.accounts.group.bump],
    ]];

    for (offset, asset) in assets.iter().enumerate() {
        // A non-signer here would fail inside mpl-core anyway; catching it up
        // front names the account that's wrong instead of surfacing Core's
        // generic complaint about a missing signature.
        require!(asset.is_signer, AttentionError::InvalidGenesisBatch);

        let unit = first_unit
            .checked_add(u16::try_from(offset).map_err(|_| AttentionError::InvalidGenesisBatch)?)
            .and_then(|index| index.checked_add(1))
            .ok_or(AttentionError::MathOverflow)?;

        // The same attribute vocabulary `mint_genesis` writes, so one-off and
        // grouped genesis NFTs read identically to a wallet or an indexer, plus
        // the unit's place in the run.
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
                    Attribute {
                        key: "unit".to_string(),
                        value: unit.to_string(),
                    },
                ],
            }),
            authority: None,
        }];

        // Owned by the group PDA (escrow) and inside the collection, whose
        // update authority is that same PDA — so it signs both as the minting
        // authority here and as the owner when the unit sells. No
        // `update_authority` call: mpl-core treats it as mutually exclusive
        // with `collection`, and membership is what carries the run's identity.
        CreateV2CpiBuilder::new(&core_program)
            .asset(asset)
            .collection(Some(&collection))
            .authority(Some(&group))
            .payer(&creator)
            .owner(Some(&group))
            .system_program(&system_program)
            .data_state(DataState::AccountState)
            .name(format!("AttentionFi Genesis #{unit}"))
            .uri(uri.clone())
            .plugins(plugins)
            .invoke_signed(signer_seeds)?;
    }

    let units = u16::try_from(assets.len()).map_err(|_| AttentionError::InvalidGenesisBatch)?;
    ctx.accounts.group.minted_units = minted_after;

    emit!(GenesisBatchMintedEvent {
        subject_mint,
        collection: ctx.accounts.collection.key(),
        units,
        minted_units: minted_after,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
