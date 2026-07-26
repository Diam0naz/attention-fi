//! Switchboard feed reading (kept separate from the pure `oracle` tier mapping,
//! which is unit-tested without the Switchboard crate). Shared by
//! `launch_from_feed` and `update_mindshare` so the parse + staleness + bps
//! conversion lives in exactly one place.

use anchor_lang::prelude::*;
use switchboard_on_demand::{PullFeedAccountData, ON_DEMAND_DEVNET_PID, ON_DEMAND_MAINNET_PID};

use crate::constants::{FEED_MAX_STALENESS, FEED_MIN_SAMPLES};
use crate::error::AttentionError;

/// Read mindshare (basis points of conversation share) from a Switchboard
/// On-Demand pull feed. Verifies the feed is owned by the devnet or mainnet
/// Switchboard program, that the value is fresh and has enough samples, then
/// converts the decimal percent to bps (e.g. 3.24% => 324).
pub fn read_mindshare_bps(feed: &AccountInfo, slot: u64) -> Result<u64> {
    let owner = feed.owner;
    require!(
        owner == &ON_DEMAND_MAINNET_PID || owner == &ON_DEMAND_DEVNET_PID,
        AttentionError::InvalidFeed
    );

    let data = feed.data.borrow();
    let parsed =
        PullFeedAccountData::parse(data).map_err(|_| error!(AttentionError::InvalidFeed))?;
    let value = parsed
        .get_value(slot, FEED_MAX_STALENESS, FEED_MIN_SAMPLES, true)
        .map_err(|_| error!(AttentionError::StaleFeed))?;

    // Feed publishes a decimal percent; scale mantissa/10^scale by 100 → bps.
    let mantissa = u128::try_from(value.mantissa().max(0)).unwrap_or(0);
    let denom = 10u128
        .checked_pow(value.scale())
        .ok_or(AttentionError::MathOverflow)?;
    let bps = mantissa
        .checked_mul(100)
        .and_then(|scaled| scaled.checked_div(denom))
        .ok_or(AttentionError::MathOverflow)?;
    Ok(u64::try_from(bps).unwrap_or(u64::MAX))
}
