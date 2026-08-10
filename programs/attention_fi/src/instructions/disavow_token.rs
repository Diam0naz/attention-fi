use anchor_lang::prelude::*;

use crate::constants::{DISAVOW_SEED, GLOBAL_SEED, GUARDIANS_SEED};
use crate::error::AttentionError;
use crate::events::DisavowEvent;
use crate::guardians::is_member;
use crate::state::{DisavowReason, Global, Guardians, TokenDisavowal};

/// Mark a token as disowned by the person it names.
///
/// The risk this answers is the one the strategy brief calls the biggest
/// non-obvious one: a token goes to a large market cap for someone who then
/// posts "I didn't launch this, don't buy it". Before this, nothing could be
/// done — the token kept trading and the protocol had no way to say anything
/// about it.
///
/// **What a disavowal does is asymmetric on purpose.** Buying stops; selling,
/// claiming and reclaiming do not. Freezing a disowned token's exits would trap
/// every holder in exactly the asset they now want out of, turning someone
/// else's misrepresentation into their loss. So the protocol closes the door
/// rather than locking the room: no new money enters, and everyone already
/// inside can leave at whatever the curve pays.
///
/// **Signed by the authority or any one guardian.** Guardians exist to act on
/// foul play quickly, and a disavowal is narrow, per-token, and reversible —
/// unlike the pause, which is protocol-wide. Requiring a quorum would mean the
/// disavowal lands a day after the screenshots.
///
/// Nobody can prove on-chain that a token misrepresents someone: the claim
/// being judged is a string in the token's metadata, and no launch instruction
/// takes a handle. So this deliberately records *that* a decision was made and
/// by whom, and leaves the deciding to people who can read.
#[derive(Accounts)]
pub struct DisavowToken<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// The guardian set, so a guardian can act without the authority's key.
    ///
    /// CHECK: seeds pin the address; the handler reads membership from it and
    /// tolerates it being absent, which is the state before `set_guardians`.
    #[account(seeds = [GUARDIANS_SEED], bump)]
    pub guardians: UncheckedAccount<'info>,

    /// CHECK: the token being disowned; only its key is used, as a seed.
    pub mint: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + TokenDisavowal::INIT_SPACE,
        seeds = [DISAVOW_SEED, mint.key().as_ref()],
        bump,
    )]
    pub disavowal: Account<'info, TokenDisavowal>,

    pub system_program: Program<'info, System>,
}

/// Whether `signer` may flag or clear a disavowal.
///
/// Split out because both handlers need it and the guardian half reads a
/// possibly-absent account — the kind of thing that quietly diverges when it is
/// written twice.
fn may_act(signer: &Pubkey, global: &Global, guardians_info: &AccountInfo) -> Result<bool> {
    if *signer == global.authority {
        return Ok(true);
    }
    if guardians_info.data_is_empty() {
        return Ok(false);
    }
    require_keys_eq!(
        *guardians_info.owner,
        crate::ID,
        AttentionError::Unauthorized
    );
    let data = guardians_info.try_borrow_data()?;
    let guardians = Guardians::try_deserialize(&mut &data[..])?;
    Ok(is_member(&guardians.members, guardians.count, signer))
}

pub fn disavow_token_handler(ctx: Context<DisavowToken>, reason: DisavowReason) -> Result<()> {
    let signer = ctx.accounts.signer.key();
    require!(
        may_act(
            &signer,
            &ctx.accounts.global,
            &ctx.accounts.guardians.to_account_info()
        )?,
        AttentionError::Unauthorized
    );

    let now = Clock::get()?.unix_timestamp;
    let bump = ctx.bumps.disavowal;
    let mint = ctx.accounts.mint.key();
    let disavowal = &mut ctx.accounts.disavowal;
    disavowal.mint = mint;
    disavowal.disavowed_by = signer;
    disavowal.reason = reason;
    disavowal.at = now;
    disavowal.bump = bump;

    emit!(DisavowEvent {
        mint,
        disavowed_by: signer,
        reason,
        disavowed: true,
        timestamp: now,
    });
    Ok(())
}

/// Lift a disavowal.
///
/// Authority only, where flagging takes any one guardian. The asymmetry is the
/// same one the pause uses and for the same reason: the cheap direction should
/// be the safe one. A wrongly-flagged token costs its creator a day; a wrongly
/// *cleared* one puts the protocol back to selling something someone has
/// publicly disowned.
///
/// Closing the account rather than clearing a flag, so a restored token is
/// indistinguishable from one that was never flagged — a lingering record with
/// `disavowed: false` is a permanent accusation.
#[derive(Accounts)]
pub struct RestoreToken<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: only its key is used, as a seed.
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [DISAVOW_SEED, mint.key().as_ref()],
        bump = disavowal.bump,
        has_one = mint,
        close = authority,
    )]
    pub disavowal: Account<'info, TokenDisavowal>,
}

pub fn restore_token_handler(ctx: Context<RestoreToken>) -> Result<()> {
    emit!(DisavowEvent {
        mint: ctx.accounts.mint.key(),
        disavowed_by: ctx.accounts.authority.key(),
        reason: ctx.accounts.disavowal.reason,
        disavowed: false,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

/// Refuse a *purchase* of a disowned token.
///
/// Only entry points call this. Exits and claims deliberately do not — see the
/// note on `DisavowToken`.
///
/// An empty account is the ordinary case (almost every token) and reads as "not
/// disavowed", the same shape as `guardians::require_live`: the address is
/// pinned by seeds, so emptiness is a fact about the chain rather than
/// something a caller can assert.
pub fn require_not_disavowed(info: &AccountInfo) -> Result<()> {
    if info.data_is_empty() {
        return Ok(());
    }
    require_keys_eq!(*info.owner, crate::ID, AttentionError::Unauthorized);
    let data = info.try_borrow_data()?;
    TokenDisavowal::try_deserialize(&mut &data[..])?;
    Err(AttentionError::TokenDisavowed.into())
}
