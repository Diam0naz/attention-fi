use anchor_lang::prelude::*;
use mpl_core::instructions::UpdatePluginV1CpiBuilder;
use mpl_core::types::Plugin;

use crate::constants::FEATUREGATE_SEED;
use crate::constants::{PERK_AUTH_SEED, PERK_SEED, TRADER_SEED};
use crate::error::AttentionError;
use crate::features::{self, FEATURE_PERKS};
use crate::nft::{perk_attributes, perk_discount_bps};
use crate::perks::next_level;
use crate::state::{PerkNft, TraderStats};

/// Move a perk up a rung, on the holder's own trading.
///
/// This used to require the protocol authority's signature and check nothing
/// but the ceiling — so levels were dispensed rather than earned, and the
/// activity thresholds the constants declare went unread. Now the holder signs
/// for themselves and the gate is arithmetic: `activity_score` against the
/// requirement for the level being claimed.
///
/// One rung per call, even when the score clears several. Each step rewrites
/// the Core asset's Attributes, and jumping straight to the earned level would
/// leave the asset displaying a level the intermediate rewrites never applied —
/// the PDA that prices the discount and the NFT people actually look at would
/// disagree.
///
/// Nothing here can be run on someone else's behalf, and nothing needs to be:
/// the holder pays their own CPI rent, so a level-up costs the protocol
/// nothing and can't be withheld by it either.
#[derive(Accounts)]
pub struct LevelUp<'info> {
    /// The perk's owner. Signs for their own level-up and pays for it.
    #[account(mut, address = perk.owner @ AttentionError::Unauthorized)]
    pub owner: Signer<'info>,

    /// The owner's cumulative trading activity — the whole basis for the
    /// level-up. Pinned by seeds to the signer, so one wallet cannot present
    /// another's volume.
    #[account(
        seeds = [TRADER_SEED, owner.key().as_ref()],
        bump = stats.bump,
    )]
    pub stats: Account<'info, TraderStats>,

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

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn level_up_handler(ctx: Context<LevelUp>) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_PERKS)?;
    // Both the ceiling and the activity requirement live in `next_level`, so
    // the two gates can't drift apart or be checked in the wrong order.
    let new_level = next_level(
        ctx.accounts.perk.level,
        ctx.accounts.stats.activity_score()?,
    )?;

    // Rewrite the asset's Attributes, signed by the program's perk authority PDA.
    let auth_bump = ctx.bumps.perk_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[PERK_AUTH_SEED, &[auth_bump]]];
    UpdatePluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.perk_authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::Attributes(perk_attributes(new_level)))
        .invoke_signed(signer_seeds)?;

    let perk = &mut ctx.accounts.perk;
    perk.level = new_level;
    perk.discount_bps = perk_discount_bps(new_level);

    Ok(())
}
