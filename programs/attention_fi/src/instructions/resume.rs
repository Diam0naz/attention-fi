use anchor_lang::prelude::*;

use crate::constants::{GUARDIANS_SEED, MAX_GUARDIANS};
use crate::error::AttentionError;
use crate::events::PauseEvent;
use crate::guardians::{is_member, record_approval};
use crate::state::Guardians;

/// Approve resuming, and resume once enough guardians have.
///
/// This is the expensive direction on purpose. Unpausing mid-incident hands an
/// attacker back whatever they were draining, so it is the one action no single
/// key should be able to take — including the protocol authority's, which is
/// why the authority isn't a signer here at all. It can choose the guardians;
/// it cannot outvote them.
///
/// Each guardian calls this once. The last one to push the tally over
/// `threshold` also lifts the pause, so resuming costs exactly as many
/// transactions as it does signatures, with no separate "execute" step to
/// forget.
///
/// Approving twice is a no-op rather than an error — a guardian resending after
/// a dropped transaction has done nothing wrong, and it must never advance the
/// count on its own.
#[derive(Accounts)]
pub struct Resume<'info> {
    pub guardian: Signer<'info>,

    #[account(mut, seeds = [GUARDIANS_SEED], bump = guardians.bump)]
    pub guardians: Account<'info, Guardians>,
}

pub fn resume_handler(ctx: Context<Resume>) -> Result<()> {
    let guardians = &mut ctx.accounts.guardians;
    let who = ctx.accounts.guardian.key();
    require!(
        is_member(&guardians.members, guardians.count, &who),
        AttentionError::NotGuardian
    );
    require!(guardians.paused, AttentionError::NotPaused);

    let standing = guardians.resume_count;
    guardians.resume_count = record_approval(&mut guardians.resume_approvals, standing, who)?;

    let resumed = guardians.resume_count >= guardians.threshold;
    if resumed {
        guardians.paused = false;
        guardians.paused_at = 0;
        guardians.resume_approvals = [Pubkey::default(); MAX_GUARDIANS];
        guardians.resume_count = 0;
    }

    emit!(PauseEvent {
        guardian: who,
        paused: !resumed,
        approvals: if resumed {
            guardians.threshold
        } else {
            guardians.resume_count
        },
        threshold: guardians.threshold,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
