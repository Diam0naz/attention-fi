use anchor_lang::prelude::*;

use crate::config::{
    validate_creator_share_bps, validate_fee_bps, validate_graduation_sol,
    validate_virtual_token_reserves,
};
use crate::constants::GLOBAL_SEED;
use crate::error::AttentionError;
use crate::events::ConfigUpdatedEvent;
use crate::state::Global;

/// Retune the protocol's trading economics.
///
/// These were fixed at `initialize` and could only be changed by deploying a
/// new program, which meant a fee set wrong once was set wrong until the next
/// release — and that a number chosen before the protocol had any users could
/// never be revised in light of them.
///
/// Every argument is optional and omitting one leaves it alone, so a call is a
/// statement about what should change rather than a full restatement of the
/// configuration. Restating a value that isn't moving is how an unrelated
/// parameter gets reverted by a stale client.
///
/// What each change reaches differs, and it is worth being clear about:
/// `fee_bps` and `creator_fee_share_bps` apply to the next trade on every
/// token; `graduation_sol` is read live, so lowering it can graduate curves
/// already past the new line on their next buy; `virtual_token_reserves` only
/// seeds launches made after the call, because a curve snapshots it and
/// repricing a live one would move the floor under people already holding.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,
}

pub fn update_config_handler(
    ctx: Context<UpdateConfig>,
    fee_bps: Option<u16>,
    creator_fee_share_bps: Option<u16>,
    graduation_sol: Option<u64>,
    virtual_token_reserves: Option<u64>,
) -> Result<()> {
    // Validate everything before writing anything: a call that sets a good fee
    // and a bad threshold must leave neither behind.
    if let Some(value) = fee_bps {
        validate_fee_bps(value)?;
    }
    if let Some(value) = creator_fee_share_bps {
        validate_creator_share_bps(value)?;
    }
    if let Some(value) = graduation_sol {
        validate_graduation_sol(value)?;
    }
    if let Some(value) = virtual_token_reserves {
        validate_virtual_token_reserves(value)?;
    }

    let global = &mut ctx.accounts.global;
    if let Some(value) = fee_bps {
        global.fee_bps = value;
    }
    if let Some(value) = creator_fee_share_bps {
        global.creator_fee_share_bps = value;
    }
    if let Some(value) = graduation_sol {
        global.graduation_sol = value;
    }
    if let Some(value) = virtual_token_reserves {
        global.virtual_token_reserves = value;
    }

    emit!(ConfigUpdatedEvent {
        authority: ctx.accounts.authority.key(),
        fee_bps: global.fee_bps,
        creator_fee_share_bps: global.creator_fee_share_bps,
        graduation_sol: global.graduation_sol,
        virtual_token_reserves: global.virtual_token_reserves,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
