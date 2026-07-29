use anchor_lang::prelude::*;

use crate::constants::GLOBAL_SEED;
use crate::error::AttentionError;
use crate::events::AuthorityChangedEvent;
use crate::state::Global;

/// Hand protocol authority to a different wallet.
///
/// `Global.authority` gates every privileged instruction (`grant_perk`,
/// `level_up`, `mint_perk`, `set_issuer`, and this one), and until now it was
/// fixed at `initialize`. That forced the deploy keypair to double as the
/// operator key: running the admin console meant importing the same key that
/// can upgrade the program into a browser extension. This lets the two be
/// separated — keep the deploy key offline, operate from an ordinary wallet.
///
/// Deliberately not two-step. A handover that needs the new authority to
/// accept would be safer against a typo, but it also needs somewhere to park
/// the pending key, which means widening `Global` and migrating every existing
/// account. The guards below cover the realistic mistakes instead.
#[derive(Accounts)]
pub struct SetAuthority<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: the incoming authority. Only its address is recorded, and it must
    /// sign — which is what proves the key exists and is controlled, rather
    /// than being a typo that would lock the protocol out permanently.
    pub new_authority: Signer<'info>,
}

pub fn set_authority_handler(ctx: Context<SetAuthority>) -> Result<()> {
    let previous = ctx.accounts.global.authority;
    let next = ctx.accounts.new_authority.key();

    // Handing authority to the current holder is a no-op that still emits an
    // event and bills a transaction; reject it so a mistaken repeat is visible.
    require_keys_neq!(previous, next, AttentionError::Unauthorized);

    ctx.accounts.global.authority = next;

    emit!(AuthorityChangedEvent {
        previous,
        current: next,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
