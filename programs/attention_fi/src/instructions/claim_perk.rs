use anchor_lang::prelude::*;

use crate::constants::{PERKGRANT_SEED, PERK_AUTH_SEED, PERK_SEED};
use crate::nft::{mint_perk_asset, perk_discount_bps};
use crate::state::{PerkGrant, PerkNft};

/// Claim a perk the protocol has already authorised via `grant_perk`.
///
/// The claimant signs and pays here, so awarding perks costs the protocol only
/// the small grant record rather than a full Core asset per recipient. This
/// route needs a matching `PerkGrant`, so it can't mint a wallet a discount it
/// wasn't given — a wallet earning one on its own volume goes through
/// `claim_earned_perk` instead.
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
