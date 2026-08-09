use anchor_lang::prelude::*;

use crate::config::{validate_fee_bps, validate_promo_price};
use crate::constants::{DEFAULT_NFT_FEE_BPS, FEECONFIG_SEED, GLOBAL_SEED, PROMO_LAMPORTS_PER_DAY};
use crate::error::AttentionError;
use crate::events::FeeConfigUpdatedEvent;
use crate::state::{FeeConfig, Global};

/// Set the NFT market's fee schedule, creating it on first use.
///
/// Also the migration path for a protocol deployed before `FeeConfig` existed:
/// `initialize` creates one for every new deployment, and an existing one gets
/// its account from the first call to this. Until that call the instructions
/// that charge these fees cannot run, which is the deliberate trade for a
/// required account — a fee schedule a buyer can decline to supply is a fee
/// schedule that only applies to honest clients.
///
/// Omitted arguments keep their current value, or take the shipped default when
/// the account is being created.
#[derive(Accounts)]
pub struct SetFeeConfig<'info> {
    #[account(mut, address = global.authority @ AttentionError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + FeeConfig::INIT_SPACE,
        seeds = [FEECONFIG_SEED],
        bump,
    )]
    pub fee_config: Account<'info, FeeConfig>,

    pub system_program: Program<'info, System>,
}

pub fn set_fee_config_handler(
    ctx: Context<SetFeeConfig>,
    nft_fee_bps: Option<u16>,
    promo_lamports_per_day: Option<u64>,
) -> Result<()> {
    // A freshly created account is all zeroes, and zero is a legal fee but not
    // a sensible unset one — so a first call that names neither value gets the
    // shipped schedule rather than a silently free marketplace.
    //
    // Detected on the promo price rather than the bump: a canonical bump of 0
    // is rare but perfectly legal, and an account that happened to get one
    // would look fresh forever, quietly resetting every omitted field to its
    // default on each call. The promo price is validated non-zero below, so
    // zero can only mean "never written".
    let fresh = ctx.accounts.fee_config.promo_lamports_per_day == 0;

    let nft_fee_bps = match nft_fee_bps {
        Some(value) => value,
        None if fresh => DEFAULT_NFT_FEE_BPS,
        None => ctx.accounts.fee_config.nft_fee_bps,
    };
    let promo_lamports_per_day = match promo_lamports_per_day {
        Some(value) => value,
        None if fresh => PROMO_LAMPORTS_PER_DAY,
        None => ctx.accounts.fee_config.promo_lamports_per_day,
    };

    validate_fee_bps(nft_fee_bps)?;
    validate_promo_price(promo_lamports_per_day)?;

    let fee_config = &mut ctx.accounts.fee_config;
    fee_config.nft_fee_bps = nft_fee_bps;
    fee_config.promo_lamports_per_day = promo_lamports_per_day;
    fee_config.bump = ctx.bumps.fee_config;

    emit!(FeeConfigUpdatedEvent {
        authority: ctx.accounts.authority.key(),
        nft_fee_bps,
        promo_lamports_per_day,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
