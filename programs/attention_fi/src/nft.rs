//! Shared helpers for the Metaplex Core NFT layer.

use crate::constants::{DISCOUNT_PER_LEVEL_BPS, MAX_PERK_LEVEL};
use mpl_core::types::{Attribute, Attributes};

/// 100% in basis points.
const BPS_DENOMINATOR: u16 = 10_000;

/// Trading-fee discount (bps) granted by a perk NFT at `level`, capped at the
/// discount for `MAX_PERK_LEVEL`.
pub fn perk_discount_bps(level: u8) -> u16 {
    let capped = if level > MAX_PERK_LEVEL {
        MAX_PERK_LEVEL
    } else {
        level
    };
    u16::from(capped) * DISCOUNT_PER_LEVEL_BPS
}

/// Effective trading fee (bps) after applying a perk holder's discount.
///
/// `discount_bps` is a share **of the fee**, not a flat subtraction from it: at
/// 1000 the holder pays 90% of the going rate, whatever that rate happens to
/// be. The flat version silently zeroed the fee — 100 bps off a 100 bps fee —
/// which made every perk level identical and paid creators nothing on a perk
/// holder's trades.
///
/// Capped at 100% so a discount can never invert the fee, and rounded in the
/// protocol's favour so the waiver can't exceed what was actually charged.
pub fn discounted_fee_bps(base_fee_bps: u16, discount_bps: u16) -> u16 {
    let discount_bps = u32::from(discount_bps.min(BPS_DENOMINATOR));
    let waived = u32::from(base_fee_bps) * discount_bps / u32::from(BPS_DENOMINATOR);
    base_fee_bps.saturating_sub(waived as u16)
}

/// Build the on-chain Attributes for a perk NFT at a given level.
pub fn perk_attributes(level: u8) -> Attributes {
    Attributes {
        attribute_list: vec![
            Attribute {
                key: "kind".to_string(),
                value: "perk".to_string(),
            },
            Attribute {
                key: "level".to_string(),
                value: level.to_string(),
            },
            Attribute {
                key: "discount_bps".to_string(),
                value: perk_discount_bps(level).to_string(),
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discount_is_a_share_of_the_fee() {
        // 10% off a 1% fee leaves 0.9%.
        assert_eq!(discounted_fee_bps(100, 1_000), 90);
        // Half off leaves half.
        assert_eq!(discounted_fee_bps(100, 5_000), 50);
        // The whole fee waived only at a full 100%.
        assert_eq!(discounted_fee_bps(100, 10_000), 0);
    }

    #[test]
    fn discount_never_inverts_or_overflows_the_fee() {
        assert_eq!(
            discounted_fee_bps(100, 25_000),
            0,
            "a discount past 100% is capped, not wrapped"
        );
        // The intermediate product would overflow u16; it must not.
        assert_eq!(discounted_fee_bps(u16::MAX, 10_000), 0);
        assert_eq!(discounted_fee_bps(u16::MAX, 0), u16::MAX);
    }

    #[test]
    fn max_level_never_waives_the_whole_fee() {
        // The bug this replaced: every level zeroed a 100 bps fee, so creators
        // and the treasury earned nothing on a perk holder's trades.
        let fee = discounted_fee_bps(100, perk_discount_bps(MAX_PERK_LEVEL));
        assert!(fee > 0, "top-level perk still pays a fee, got {fee}");
        assert_eq!(fee, 50, "level 5 halves a 1% fee");
    }

    #[test]
    fn each_level_is_strictly_better_than_the_last() {
        let mut previous = discounted_fee_bps(100, perk_discount_bps(0));
        for level in 1..=MAX_PERK_LEVEL {
            let fee = discounted_fee_bps(100, perk_discount_bps(level));
            assert!(
                fee < previous,
                "level {level} must beat level {}: {fee} vs {previous}",
                level - 1
            );
            previous = fee;
        }
    }

    #[test]
    fn discount_scales_with_level_and_caps() {
        assert_eq!(perk_discount_bps(0), 0);
        assert_eq!(perk_discount_bps(1), DISCOUNT_PER_LEVEL_BPS);
        assert_eq!(perk_discount_bps(3), 3 * DISCOUNT_PER_LEVEL_BPS);
        // Capped at MAX_PERK_LEVEL.
        assert_eq!(
            perk_discount_bps(MAX_PERK_LEVEL),
            u16::from(MAX_PERK_LEVEL) * DISCOUNT_PER_LEVEL_BPS
        );
        assert_eq!(
            perk_discount_bps(MAX_PERK_LEVEL + 10),
            perk_discount_bps(MAX_PERK_LEVEL)
        );
    }
}
