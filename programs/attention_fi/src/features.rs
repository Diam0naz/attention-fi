//! Which product features accept new entries.
//!
//! The app is being tested on one loop (verify, bonding-curve launch, trade,
//! graduate, claim fees). Hiding the other features in the frontend is not
//! enough: the instructions stay deployed and anyone can call them directly.
//! This gate lets the authority switch a feature off on-chain.
//!
//! Turning a feature off stops **new entries** into it (launching, listing,
//! minting, bidding, buying) and deliberately leaves **exits** open (selling,
//! settling, reclaiming, burning, claiming). It is the same judgement the
//! guardian pause and disavowal make: stop new risk, never trap money the
//! ledger already says is owed.
//!
//! An empty gate account reads as "everything enabled", the same rule
//! `guardians::require_live` uses. A deploy then changes nothing until the
//! authority runs `set_feature_gate`, and the address is pinned by seeds, so
//! emptiness is a fact about the chain rather than something a caller asserts.

use crate::error::AttentionError;
use crate::state::FeatureGate;
use anchor_lang::prelude::*;

/// Dutch auction launches and bids.
pub const FEATURE_DUTCH: u32 = 1 << 0;
/// Conviction-curve launches and buys.
pub const FEATURE_CONVICTION: u32 = 1 << 1;
/// Revenue-share launches and buys.
pub const FEATURE_REVENUE: u32 = 1 << 2;
/// The NFT layer: minting, collections, listings, purchases, genesis runs, promotion.
pub const FEATURE_NFT: u32 = 1 << 3;
/// Perks: minting, granting, earning, levelling.
pub const FEATURE_PERKS: u32 = 1 << 4;

/// Every bit the program knows about.
pub const ALL_FEATURES: u32 =
    FEATURE_DUTCH | FEATURE_CONVICTION | FEATURE_REVENUE | FEATURE_NFT | FEATURE_PERKS;

/// Reject a mask with bits the program doesn't define. An unknown bit would
/// read as "disabled something" while disabling nothing, and a later program
/// version that gives that bit a meaning would switch a feature off silently.
pub fn validate_mask(disabled: u32) -> Result<()> {
    require!(
        disabled & !ALL_FEATURES == 0,
        AttentionError::InvalidFeatureMask
    );
    Ok(())
}

/// Whether `feature` is switched off in `disabled`.
pub fn is_disabled(disabled: u32, feature: u32) -> bool {
    disabled & feature != 0
}

/// Refuse a new entry into `feature` when the authority has switched it off.
pub fn require_enabled(info: &AccountInfo, feature: u32) -> Result<()> {
    if info.data_is_empty() {
        return Ok(());
    }
    require_keys_eq!(*info.owner, crate::ID, AttentionError::Unauthorized);
    let data = info.try_borrow_data()?;
    let gate = FeatureGate::try_deserialize(&mut &data[..])?;
    require!(
        !is_disabled(gate.disabled, feature),
        AttentionError::FeatureDisabled
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_feature_has_its_own_bit() {
        let bits = [
            FEATURE_DUTCH,
            FEATURE_CONVICTION,
            FEATURE_REVENUE,
            FEATURE_NFT,
            FEATURE_PERKS,
        ];
        for (i, a) in bits.iter().enumerate() {
            assert_eq!(a.count_ones(), 1);
            for b in &bits[i + 1..] {
                assert_eq!(a & b, 0, "two features sharing a bit switch off together");
            }
        }
        assert_eq!(ALL_FEATURES.count_ones(), bits.len() as u32);
    }

    #[test]
    fn only_known_bits_are_accepted() {
        assert!(validate_mask(0).is_ok(), "everything enabled");
        assert!(validate_mask(ALL_FEATURES).is_ok(), "everything off");
        assert!(validate_mask(FEATURE_NFT | FEATURE_PERKS).is_ok());
        assert!(validate_mask(1 << 5).is_err());
        assert!(validate_mask(ALL_FEATURES | (1 << 31)).is_err());
    }

    #[test]
    fn disabling_one_feature_leaves_the_others_on() {
        let disabled = FEATURE_DUTCH | FEATURE_NFT;
        assert!(is_disabled(disabled, FEATURE_DUTCH));
        assert!(is_disabled(disabled, FEATURE_NFT));
        assert!(!is_disabled(disabled, FEATURE_CONVICTION));
        assert!(!is_disabled(disabled, FEATURE_REVENUE));
        assert!(!is_disabled(disabled, FEATURE_PERKS));
        assert!(
            !is_disabled(0, FEATURE_DUTCH),
            "an empty mask disables nothing"
        );
    }
}
