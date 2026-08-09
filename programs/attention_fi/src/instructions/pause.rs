use anchor_lang::prelude::*;

use crate::constants::{GUARDIANS_SEED, MAX_GUARDIANS};
use crate::error::AttentionError;
use crate::events::PauseEvent;
use crate::guardians::is_member;
use crate::state::Guardians;

/// Halt every gated instruction. One guardian is enough.
///
/// Deliberately not a threshold. An exploit in progress is measured in blocks,
/// and a stop that must first collect three signatures arrives after the money
/// has gone. The asymmetry is the design: the cheap direction is the safe one,
/// and the expensive direction — resuming — is where several people have to
/// agree.
///
/// The worst a single malicious guardian achieves is halting trading, which is
/// loud, recoverable by the others, and fixed permanently by the authority
/// rotating them out.
///
/// Pausing while already paused is refused rather than treated as a no-op:
/// re-pausing would reset the resume approvals, so an attacker holding one
/// guardian key could otherwise cancel a resume vote indefinitely by spamming
/// this instruction.
#[derive(Accounts)]
pub struct Pause<'info> {
    pub guardian: Signer<'info>,

    #[account(mut, seeds = [GUARDIANS_SEED], bump = guardians.bump)]
    pub guardians: Account<'info, Guardians>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let guardians = &mut ctx.accounts.guardians;
    require!(
        is_member(
            &guardians.members,
            guardians.count,
            &ctx.accounts.guardian.key()
        ),
        AttentionError::NotGuardian
    );
    require!(!guardians.paused, AttentionError::ProtocolPaused);

    guardians.paused = true;
    guardians.paused_at = Clock::get()?.unix_timestamp;
    // Approvals belong to one incident. Carrying them across a fresh pause
    // would mean a resume vote for yesterday's problem counting toward today's.
    guardians.resume_approvals = [Pubkey::default(); MAX_GUARDIANS];
    guardians.resume_count = 0;

    emit!(PauseEvent {
        guardian: ctx.accounts.guardian.key(),
        paused: true,
        approvals: 0,
        threshold: guardians.threshold,
        timestamp: guardians.paused_at,
    });
    Ok(())
}
