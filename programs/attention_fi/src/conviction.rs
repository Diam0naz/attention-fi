//! Conviction-curve helpers.
//!
//! The conviction curve reuses the constant-product pricing from [`crate::curve`]
//! but adds a loyalty mechanic: every buy re-locks the holder's position for
//! `lock_period` seconds, and selling *before* the unlock time forfeits a
//! percentage of the proceeds (an early-exit penalty that stays in the protocol
//! as an LP-reward proxy). This is the "loyalty over exit speed" mechanism the
//! strategy brief specifies for niche verticals (music, gaming).

use crate::error::AttentionError;
use anchor_lang::prelude::*;

const BPS_DENOMINATOR: u128 = 10_000;

/// Penalty (lamports) forfeited when selling a still-locked position.
/// `penalty_bps` is charged against the seller's net proceeds `sol_out`.
pub fn early_exit_penalty(sol_out: u64, penalty_bps: u16) -> Result<u64> {
    let penalty = u128::from(sol_out)
        .checked_mul(u128::from(penalty_bps))
        .and_then(|product| product.checked_div(BPS_DENOMINATOR))
        .ok_or(AttentionError::MathOverflow)?;
    u64::try_from(penalty).map_err(|_| AttentionError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE_SOL: u64 = 1_000_000_000;

    #[test]
    fn penalty_is_a_fraction_of_proceeds() {
        // 10% early-exit penalty on 1 SOL.
        assert_eq!(early_exit_penalty(ONE_SOL, 1_000).unwrap(), ONE_SOL / 10);
    }

    #[test]
    fn zero_penalty_bps_forfeits_nothing() {
        assert_eq!(early_exit_penalty(ONE_SOL, 0).unwrap(), 0);
    }

    #[test]
    fn penalty_never_exceeds_proceeds() {
        // Even a 100% penalty caps at the proceeds themselves.
        let p = early_exit_penalty(ONE_SOL, 10_000).unwrap();
        assert_eq!(p, ONE_SOL);
        assert!(p <= ONE_SOL);
    }
}
