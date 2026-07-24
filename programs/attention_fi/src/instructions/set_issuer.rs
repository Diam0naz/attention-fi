use anchor_lang::prelude::*;

use crate::constants::{GLOBAL_SEED, ISSUER_SEED};
use crate::error::AttentionError;
use crate::state::{Global, IssuerConfig};

/// Set (or rotate) the dedicated key authorized to sign SAS attestations,
/// admin-gated by `Global.authority`. First call creates the PDA; later
/// calls just overwrite `issuer`, so a compromised or expiring issuer key
/// can be swapped without migrating `Global` or redeploying.
#[derive(Accounts)]
pub struct SetIssuer<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + IssuerConfig::INIT_SPACE,
        seeds = [ISSUER_SEED],
        bump,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,

    pub system_program: Program<'info, System>,
}

pub fn set_issuer_handler(ctx: Context<SetIssuer>, issuer: Pubkey) -> Result<()> {
    let issuer_config = &mut ctx.accounts.issuer_config;
    issuer_config.issuer = issuer;
    issuer_config.bump = ctx.bumps.issuer_config;
    Ok(())
}
