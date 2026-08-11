//! How often one wallet may launch.
//!
//! The pre-launch checklist: "Without limits, bots will launch hundreds of fake
//! narrative tokens to pollute the feed. Max 3 launches per wallet per 24
//! hours." The feed is the product, so burying it is not a nuisance — it is an
//! attack on the only surface that matters.
//!
//! **A sliding window, not a resetting counter.** The cheap version stores a
//! count and a window start and clears both when the window expires. That has a
//! hole worth naming: three launches at 23:59 and three more at 00:01 is six in
//! two minutes, entirely within the rules. Finding that boundary is the first
//! thing a script does. Storing the actual timestamps and counting the ones
//! inside the trailing window costs 24 bytes and means what it says.
//!
//! **One quota across every mechanism.** Bonding curve, Dutch auction,
//! conviction and revenue-share share it, or a bot simply rotates through the
//! four for quadruple the allowance.
//!
//! What this does not do, and should not be mistaken for: it bounds *a wallet*.
//! It does nothing about someone funding fifty of them. No on-chain rate limit
//! can, and treating this as sybil resistance is how a protocol ends up with
//! the feeling of protection and none of the substance — that job belongs to
//! the curated cohort and SAS verification.
//!
//! All functions are pure so the window arithmetic is unit-tested off-chain.

use crate::constants::MAX_LAUNCH_SLOTS;
use crate::error::AttentionError;
use anchor_lang::prelude::*;

/// Launches allowed per window when no policy account has been installed.
pub const DEFAULT_MAX_LAUNCHES: u8 = 3;

/// The window those launches are counted over, in seconds.
pub const DEFAULT_WINDOW_SECS: i64 = 86_400;

/// Check a proposed policy before it is written.
///
/// The cap may not exceed the ring, because the window would then be able to
/// hold more launches than the account can remember — and a limit that forgets
/// is a limit that leaks. Bounding the window at a year keeps a fat-fingered
/// value from being indistinguishable from a permanent ban.
pub fn validate_policy(max_launches: u8, window_secs: i64) -> Result<()> {
    require!(
        max_launches >= 1 && usize::from(max_launches) <= MAX_LAUNCH_SLOTS,
        AttentionError::InvalidLaunchPolicy
    );
    // The floor is one second rather than something more opinionated because
    // the authority is the only caller and a short window is a self-inflicted
    // foot-gun, not an attack — while a test environment or a seeded demo
    // genuinely needs one. The ceiling matters more: a year-long window is
    // indistinguishable from a permanent ban, and should be typed as one.
    require!(
        (1..=365 * 86_400).contains(&window_secs),
        AttentionError::InvalidLaunchPolicy
    );
    Ok(())
}

/// The policy in force, reading an absent account as the defaults.
///
/// Same shape as `guardians::require_live`: an empty account is the ordinary
/// state of a fresh deployment, not an error, so launching is bounded from the
/// first block rather than from whenever a config transaction lands. The
/// address is pinned by seeds, so emptiness is a fact about the chain and not
/// something a caller can assert.
pub fn policy_or_default(info: &AccountInfo) -> Result<(u8, i64)> {
    if info.data_is_empty() {
        return Ok((DEFAULT_MAX_LAUNCHES, DEFAULT_WINDOW_SECS));
    }
    require_keys_eq!(*info.owner, crate::ID, AttentionError::Unauthorized);
    let data = info.try_borrow_data()?;
    let policy = crate::state::LaunchPolicy::try_deserialize(&mut &data[..])?;
    Ok((policy.max_launches, policy.window_secs))
}

/// How many of `stamps` fall inside the window ending at `now`.
///
/// Zeroed slots are ignored rather than treated as time 0, which would
/// otherwise count as "very old" and be harmlessly excluded — correct by
/// accident today, wrong the moment the comparison changes. Being explicit
/// costs nothing.
pub fn launches_in_window(stamps: &[i64], now: i64, window_secs: i64) -> u8 {
    let cutoff = now.saturating_sub(window_secs);
    let mut count = 0u8;
    for stamp in stamps {
        if *stamp > 0 && *stamp > cutoff {
            count = count.saturating_add(1);
        }
    }
    count
}

/// Record a launch at `now`, or refuse when the window is full.
///
/// Overwrites the oldest slot, so the ring always holds the most recent
/// launches — which is what a trailing window needs. Returns the slot written
/// so the caller can persist it.
pub fn record_launch(
    stamps: &mut [i64; MAX_LAUNCH_SLOTS],
    now: i64,
    max_launches: u8,
    window_secs: i64,
) -> Result<()> {
    require!(
        launches_in_window(stamps, now, window_secs) < max_launches,
        AttentionError::LaunchRateLimited
    );

    // The oldest slot is the one to reuse: any slot outside the window is spent,
    // and if every slot is inside the window we haven't hit the cap (checked
    // above) only because the cap is below the ring size.
    let mut oldest = 0usize;
    for (i, stamp) in stamps.iter().enumerate() {
        if *stamp < stamps[oldest] {
            oldest = i;
        }
    }
    stamps[oldest] = now;
    Ok(())
}

/// Seconds until the caller may launch again, or 0 when they may now.
///
/// Reported so a client can say "in 4 hours" rather than "no". A limit that
/// can't tell you when it lifts reads as a bug.
pub fn seconds_until_next(stamps: &[i64], now: i64, max_launches: u8, window_secs: i64) -> i64 {
    if launches_in_window(stamps, now, window_secs) < max_launches {
        return 0;
    }
    // The window frees a slot when its oldest *in-window* launch ages out.
    let cutoff = now.saturating_sub(window_secs);
    let mut oldest_inside = i64::MAX;
    for stamp in stamps {
        if *stamp > 0 && *stamp > cutoff && *stamp < oldest_inside {
            oldest_inside = *stamp;
        }
    }
    if oldest_inside == i64::MAX {
        return 0;
    }
    (oldest_inside + window_secs - now).max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 86_400;
    const NOW: i64 = 1_800_000_000;

    fn empty() -> [i64; MAX_LAUNCH_SLOTS] {
        [0; MAX_LAUNCH_SLOTS]
    }

    #[test]
    fn a_fresh_wallet_may_launch_up_to_the_cap() {
        let mut stamps = empty();
        for i in 0..DEFAULT_MAX_LAUNCHES {
            record_launch(&mut stamps, NOW + i64::from(i), DEFAULT_MAX_LAUNCHES, DAY).unwrap();
        }
        assert_eq!(
            launches_in_window(&stamps, NOW + 10, DAY),
            DEFAULT_MAX_LAUNCHES
        );
        assert!(record_launch(&mut stamps, NOW + 10, DEFAULT_MAX_LAUNCHES, DAY).is_err());
    }

    #[test]
    fn the_window_slides_rather_than_resetting() {
        // The hole this closes. With a calendar-style reset, three launches at
        // the end of one window and three at the start of the next are six in
        // as long as it takes to send two transactions. Here the third launch
        // still blocks until the *first* one is genuinely 24h old.
        let mut stamps = empty();
        for i in 0..3 {
            record_launch(&mut stamps, NOW + i, 3, DAY).unwrap();
        }
        // One second after a naive window would have rolled over.
        assert!(
            record_launch(&mut stamps, NOW + DAY - 1, 3, DAY).is_err(),
            "a burst across the boundary must still be refused"
        );
        // And permitted only once the oldest actually ages out.
        assert!(record_launch(&mut stamps, NOW + DAY + 1, 3, DAY).is_ok());
    }

    #[test]
    fn old_launches_stop_counting() {
        let mut stamps = empty();
        record_launch(&mut stamps, NOW, 3, DAY).unwrap();
        assert_eq!(launches_in_window(&stamps, NOW + DAY + 1, DAY), 0);
    }

    #[test]
    fn the_ring_keeps_the_newest_launches() {
        // More launches than slots, one a day so each is outside the window of
        // the last: the ring must end up holding the most recent
        // MAX_LAUNCH_SLOTS, not the first ones it ever saw.
        let mut stamps = empty();
        let total = MAX_LAUNCH_SLOTS + 2;
        for day in 0..total as i64 {
            record_launch(&mut stamps, NOW + day * DAY, 3, DAY).unwrap();
        }
        let newest = NOW + (total as i64 - 1) * DAY;
        assert!(stamps.contains(&newest), "the latest launch is retained");
        assert!(
            !stamps.contains(&NOW),
            "the first launch was overwritten once the ring wrapped"
        );
        assert!(!stamps.contains(&(NOW + DAY)), "and so was the second");
    }

    #[test]
    fn a_blocked_wallet_is_told_when_it_can_launch_again() {
        let mut stamps = empty();
        for i in 0..3 {
            record_launch(&mut stamps, NOW + i, 3, DAY).unwrap();
        }
        let wait = seconds_until_next(&stamps, NOW + 3, 3, DAY);
        assert!(
            wait > 0 && wait <= DAY,
            "wait is inside the window, got {wait}"
        );
        // Exactly when the oldest ages out.
        assert_eq!(seconds_until_next(&stamps, NOW + DAY, 3, DAY), 0);
    }

    #[test]
    fn a_wallet_under_the_cap_is_told_it_may_launch_now() {
        let mut stamps = empty();
        record_launch(&mut stamps, NOW, 3, DAY).unwrap();
        assert_eq!(seconds_until_next(&stamps, NOW + 1, 3, DAY), 0);
    }

    #[test]
    fn a_policy_cannot_outrun_the_memory_it_is_stored_in() {
        // The leak this closes: a cap of 12 on an 8-slot ring would let the
        // 9th launch overwrite a slot still inside the window, so the count
        // would read low and the limit would quietly stop binding.
        assert!(validate_policy(DEFAULT_MAX_LAUNCHES, DEFAULT_WINDOW_SECS).is_ok());
        assert!(validate_policy(MAX_LAUNCH_SLOTS as u8, DAY).is_ok());
        assert!(validate_policy(MAX_LAUNCH_SLOTS as u8 + 1, DAY).is_err());
        assert!(
            validate_policy(0, DAY).is_err(),
            "zero is a ban, not a policy"
        );
        assert!(
            validate_policy(3, 0).is_err(),
            "a zero window bounds nothing"
        );
        assert!(
            validate_policy(3, 1).is_ok(),
            "a one-second window is legal — seeding a demo environment needs it"
        );
        assert!(validate_policy(3, 400 * DAY).is_err());
    }

    #[test]
    fn a_cap_of_zero_stops_launches_entirely() {
        // Reachable only through a deliberate policy write, and it should mean
        // what it says rather than silently behaving as "unlimited".
        let mut stamps = empty();
        assert!(record_launch(&mut stamps, NOW, 0, DAY).is_err());
    }
}
