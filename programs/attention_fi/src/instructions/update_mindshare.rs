use anchor_lang::prelude::*;

use crate::constants::MINDSHARE_SEED;
use crate::oracle::tier_from_mindshare_bps;
use crate::oracle_feed::read_mindshare_bps;
use crate::state::MindshareState;

/// Refresh a token's on-chain mindshare snapshot from the Switchboard feed.
/// Permissionless (anyone/a crank can call it) but trustless — the value comes
/// from the oracle, not the caller. Keyed by mint, so it works for a token on
/// any launch mechanism. Instructions that react to attention read this PDA
/// instead of doing their own oracle round-trip.
#[derive(Accounts)]
pub struct UpdateMindshare<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: the token mint this mindshare tracks; only its key is used (seed).
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Switchboard On-Demand pull feed; ownership + freshness validated
    /// in the handler via `read_mindshare_bps`.
    pub feed: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + MindshareState::INIT_SPACE,
        seeds = [MINDSHARE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub mindshare: Account<'info, MindshareState>,

    pub system_program: Program<'info, System>,
}

pub fn update_mindshare_handler(ctx: Context<UpdateMindshare>) -> Result<()> {
    let slot = Clock::get()?.slot;
    let bps = read_mindshare_bps(&ctx.accounts.feed.to_account_info(), slot)?;
    let tier = tier_from_mindshare_bps(bps);

    let mindshare = &mut ctx.accounts.mindshare;
    mindshare.mint = ctx.accounts.mint.key();
    mindshare.mindshare_bps = bps;
    mindshare.tier = tier.as_u8();
    mindshare.updated_slot = slot;
    mindshare.bump = ctx.bumps.mindshare;
    Ok(())
}
