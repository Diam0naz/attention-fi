use anchor_lang::prelude::*;

use crate::constants::FEATUREGATE_SEED;
use crate::constants::{GLOBAL_SEED, MAX_PERK_LEVEL, PERKGRANT_SEED};
use crate::error::AttentionError;
use crate::features::{self, FEATURE_PERKS};
use crate::state::{Global, PerkGrant};

/// Authorise a wallet to claim a perk NFT at a given level.
///
/// The counterpart to `claim_perk`. `mint_perk` mints and pays in one step,
/// which means the protocol funds rent for every perk it hands out — fine for
/// one-off grants, expensive when awarding a task board in batches. This writes
/// only a small authorisation record (~80 bytes) per recipient and lets each
/// one pay for their own Core asset when they claim.
///
/// Still authority-gated: a perk is a fee discount, so who receives one has to
/// remain a protocol decision.
#[derive(Accounts)]
pub struct GrantPerk<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: the wallet being authorised. Never signs here — the whole point
    /// is that the protocol grants ahead of the recipient showing up.
    pub recipient: UncheckedAccount<'info>,

    /// One outstanding grant per recipient: `init` fails if they already have
    /// an unclaimed one, so a double-grant can't mint two perks.
    #[account(
        init,
        payer = authority,
        space = 8 + PerkGrant::INIT_SPACE,
        seeds = [PERKGRANT_SEED, recipient.key().as_ref()],
        bump,
    )]
    pub grant: Account<'info, PerkGrant>,

    pub system_program: Program<'info, System>,

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn grant_perk_handler(ctx: Context<GrantPerk>, level: u8) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_PERKS)?;
    require!(
        (1..=MAX_PERK_LEVEL).contains(&level),
        AttentionError::InvalidPerkLevel
    );

    let grant = &mut ctx.accounts.grant;
    grant.recipient = ctx.accounts.recipient.key();
    grant.level = level;
    // Recorded rather than assumed: rent goes back to whoever actually paid,
    // even if the protocol authority changes before the grant is claimed.
    grant.granter = ctx.accounts.authority.key();
    grant.bump = ctx.bumps.grant;

    Ok(())
}
