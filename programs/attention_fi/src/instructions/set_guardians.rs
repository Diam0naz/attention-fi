use anchor_lang::prelude::*;

use crate::constants::{GLOBAL_SEED, GUARDIANS_SEED, MAX_GUARDIANS};
use crate::error::AttentionError;
use crate::guardians::validate_set;
use crate::state::{Global, Guardians};

/// Install or rotate the guardian set.
///
/// Authority-only, and it is the one thing about the pause the authority
/// controls: it can choose who holds a stop, but cannot pull one alone, and
/// cannot resume alone either. That separation is the point — an authority key
/// that could also unpause would make the threshold decorative.
///
/// `init_if_needed` so the set can be installed on a program that is already
/// live, the same migration shape `set_fee_config` uses. Until it runs, the
/// account is empty and `guardians::require_live` reads that as "not paused",
/// so a deploy never bricks trading in the window before it.
///
/// Rotating while paused deliberately keeps the pause on and clears the
/// approvals collected so far: the outgoing set's votes should not carry into
/// a decision the incoming set is now responsible for.
#[derive(Accounts)]
pub struct SetGuardians<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Guardians::INIT_SPACE,
        seeds = [GUARDIANS_SEED],
        bump,
    )]
    pub guardians: Account<'info, Guardians>,

    pub system_program: Program<'info, System>,
}

pub fn set_guardians_handler(
    ctx: Context<SetGuardians>,
    members: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    validate_set(&members, threshold)?;

    let bump = ctx.bumps.guardians;
    let guardians = &mut ctx.accounts.guardians;
    guardians.authority = ctx.accounts.authority.key();
    guardians.members = [Pubkey::default(); MAX_GUARDIANS];
    for (slot, member) in guardians.members.iter_mut().zip(members.iter()) {
        *slot = *member;
    }
    guardians.count =
        u8::try_from(members.len()).map_err(|_| AttentionError::InvalidGuardianSet)?;
    guardians.threshold = threshold;
    // A rotation is not a resume. Whether trading is halted is a fact about the
    // incident, not about who is on the roster.
    guardians.resume_approvals = [Pubkey::default(); MAX_GUARDIANS];
    guardians.resume_count = 0;
    guardians.bump = bump;

    Ok(())
}
