use anchor_lang::prelude::*;

use crate::constants::{GLOBAL_SEED, LAUNCHPOLICY_SEED};
use crate::error::AttentionError;
use crate::launch_quota::validate_policy;
use crate::state::{Global, LaunchPolicy};

/// Retune how often a wallet may launch, without a redeploy.
///
/// Its own account for the reason `FeeConfig` and `Guardians` are: `Global` is
/// already on-chain at a fixed length, and Anchor sizes accounts exactly, so
/// growing it would fail to deserialise on every instruction that reads it.
///
/// `init_if_needed`, so this can be installed on a live program. Until it runs,
/// `launch_quota::policy_or_default` supplies 3 per 24 hours — the limit binds
/// from the first block rather than from whenever an admin remembers, which is
/// the opposite of how a rate limit usually ships.
#[derive(Accounts)]
pub struct SetLaunchPolicy<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + LaunchPolicy::INIT_SPACE,
        seeds = [LAUNCHPOLICY_SEED],
        bump,
    )]
    pub policy: Account<'info, LaunchPolicy>,

    pub system_program: Program<'info, System>,
}

pub fn set_launch_policy_handler(
    ctx: Context<SetLaunchPolicy>,
    max_launches: u8,
    window_secs: i64,
) -> Result<()> {
    validate_policy(max_launches, window_secs)?;

    let bump = ctx.bumps.policy;
    let policy = &mut ctx.accounts.policy;
    policy.authority = ctx.accounts.authority.key();
    policy.max_launches = max_launches;
    policy.window_secs = window_secs;
    policy.bump = bump;
    Ok(())
}
