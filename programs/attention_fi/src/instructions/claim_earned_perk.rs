use anchor_lang::prelude::*;

use crate::constants::FEATUREGATE_SEED;
use crate::constants::{PERK_AUTH_SEED, PERK_SEED, TRADER_SEED};
use crate::features::{self, FEATURE_PERKS};
use crate::nft::{mint_perk_asset, perk_discount_bps};
use crate::perks::level_for_claim;
use crate::state::{PerkNft, TraderStats};

/// Mint your own perk, on the strength of your own trading.
///
/// `PERK_LEVEL_ACTIVITY_LAMPORTS` has described this ladder since the perk
/// system was written — 1, 5, 20, 75, 250 SOL of cumulative activity — and
/// nothing referenced it. The only way to hold a perk was for the authority to
/// issue a `PerkGrant`, which made a discount the docs called earned into one
/// the admin dispensed. This is the instruction that ladder was always for.
///
/// Deliberately a separate instruction rather than an optional `grant` on
/// `claim_perk`. That account is closed by the claim (`close = granter`) under
/// an `address = grant.granter` constraint, and making it optional would mean
/// making the refund target optional too — dropping the one constraint that
/// stops a claimant redirecting the rent refund to themselves. Two entry points
/// sharing `mint_perk_asset` keeps that check intact and guarantees both routes
/// mint the same asset.
///
/// The claimant signs and funds everything, so this costs the protocol nothing.
#[derive(Accounts)]
pub struct ClaimEarnedPerk<'info> {
    /// The trader claiming their own perk. Signs and funds the asset.
    #[account(mut)]
    pub recipient: Signer<'info>,

    /// Cumulative activity, and the whole basis for the claim. Pinned by seeds
    /// to the signer, so a wallet can't present someone else's volume.
    #[account(
        seeds = [TRADER_SEED, recipient.key().as_ref()],
        bump = stats.bump,
    )]
    pub stats: Account<'info, TraderStats>,

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

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn claim_earned_perk_handler(ctx: Context<ClaimEarnedPerk>, uri: String) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_PERKS)?;
    // Mints at the level the volume has already bought rather than always at 1.
    // A trader who crossed four thresholds before claiming would otherwise owe
    // four more transactions to reach a level they had already earned.
    let level = level_for_claim(ctx.accounts.stats.activity_score()?)?;

    mint_perk_asset(
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.asset.to_account_info(),
        &ctx.accounts.recipient.to_account_info(),
        &ctx.accounts.perk_authority.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        level,
        uri,
    )?;

    let perk = &mut ctx.accounts.perk;
    perk.asset = ctx.accounts.asset.key();
    perk.owner = ctx.accounts.recipient.key();
    perk.level = level;
    perk.discount_bps = perk_discount_bps(level);
    perk.bump = ctx.bumps.perk;

    Ok(())
}
