//! Mindshare-oracle logic: map a Switchboard feed value to a launch tier.
//!
//! Phase 1 seeded the curve from a `tier` argument supplied by a trusted keeper.
//! This module derives the tier on-chain from a Switchboard On-Demand feed value
//! instead, so the starting price is anchored to a decentralized oracle rather
//! than keeper trust. The value→tier mapping is pure and unit-tested here; the
//! feed *reading* (which needs the Switchboard crate) lives in the instruction.

use crate::state::MindshareTier;

/// Mindshare as basis points of crypto-Twitter conversation share
/// (e.g. 3.24% share = 324). Thresholds mirror the seed-tier table.
pub fn tier_from_mindshare_bps(bps: u64) -> MindshareTier {
    if bps >= 300 {
        MindshareTier::Top10 // >= 3%
    } else if bps >= 100 {
        MindshareTier::Top100 // >= 1%
    } else if bps >= 40 {
        MindshareTier::Emerging // >= 0.4%
    } else {
        MindshareTier::NewEntrant
    }
}

/// Whether `launch_token` may seed a curve at `tier` without the oracle.
///
/// `launch_token` takes its tier from the caller, so letting any creator pick
/// any tier meant an unknown account could launch at the Top 10 seed and the
/// "mindshare-seeded price" was only as honest as the launcher. A seeded tier
/// now has to come from `launch_from_feed`, where the oracle derives it. The
/// caller-chosen path keeps the flat start (`NewEntrant`), and the protocol
/// authority keeps keeper launches for operations and tests.
pub fn tier_allowed_without_oracle(tier: MindshareTier, caller_is_authority: bool) -> bool {
    caller_is_authority || tier == MindshareTier::NewEntrant
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_flat_start_is_open_without_the_oracle() {
        assert!(tier_allowed_without_oracle(
            MindshareTier::NewEntrant,
            false
        ));
        for tier in [
            MindshareTier::Emerging,
            MindshareTier::Top100,
            MindshareTier::Top10,
        ] {
            assert!(
                !tier_allowed_without_oracle(tier, false),
                "a creator must not choose their own seeded price"
            );
            assert!(
                tier_allowed_without_oracle(tier, true),
                "keeper launches stay with the authority"
            );
        }
    }

    #[test]
    fn maps_each_band_to_the_right_tier() {
        assert_eq!(tier_from_mindshare_bps(0), MindshareTier::NewEntrant);
        assert_eq!(tier_from_mindshare_bps(39), MindshareTier::NewEntrant);
        assert_eq!(tier_from_mindshare_bps(40), MindshareTier::Emerging);
        assert_eq!(tier_from_mindshare_bps(99), MindshareTier::Emerging);
        assert_eq!(tier_from_mindshare_bps(100), MindshareTier::Top100);
        assert_eq!(tier_from_mindshare_bps(299), MindshareTier::Top100);
        assert_eq!(tier_from_mindshare_bps(300), MindshareTier::Top10);
        assert_eq!(tier_from_mindshare_bps(324), MindshareTier::Top10);
    }

    #[test]
    fn higher_mindshare_never_maps_to_a_lower_tier() {
        let mut prev = MindshareTier::NewEntrant.as_u8();
        for bps in (0..=500).step_by(10) {
            let tier = tier_from_mindshare_bps(bps).as_u8();
            assert!(tier >= prev, "tier must be monotonic in mindshare");
            prev = tier;
        }
    }
}
