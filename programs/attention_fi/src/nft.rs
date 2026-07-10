//! Shared helpers for the Metaplex Core NFT layer.

use crate::constants::{DISCOUNT_PER_LEVEL_BPS, MAX_PERK_LEVEL};
use mpl_core::types::{Attribute, Attributes};

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
