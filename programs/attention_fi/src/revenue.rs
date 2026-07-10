//! Revenue-share distribution accounting.
//!
//! A revenue-share token is a claim on a stream of deposited revenue. Rather than
//! iterate over every holder on each deposit (impossible on-chain at scale), we
//! keep a cumulative `acc_revenue_per_share` accumulator (MasterChef / Synthetix
//! style): a deposit bumps the accumulator by `amount / total_staked`, and each
//! holder's entitlement is `staked * acc - reward_debt`, settled lazily when they
//! interact. This is the creator-economy mechanism from the strategy brief —
//! holders own a piece of the subject's monetisation.
//!
//! `acc_revenue_per_share` is scaled by [`ACC_SCALE`] to preserve precision across
//! integer division. All functions are pure for off-chain unit testing.

use crate::error::AttentionError;
use anchor_lang::prelude::*;

/// Fixed-point scale for the per-share accumulator.
pub const ACC_SCALE: u128 = 1_000_000_000_000;

/// How much `acc_revenue_per_share` grows when `amount` lamports of revenue are
/// deposited across `total_staked` shares.
pub fn acc_increment(amount: u64, total_staked: u64) -> Result<u128> {
    require!(total_staked > 0, AttentionError::NoStakers);
    u128::from(amount)
        .checked_mul(ACC_SCALE)
        .and_then(|scaled| scaled.checked_div(u128::from(total_staked)))
        .ok_or(AttentionError::MathOverflow.into())
}

/// Total revenue (lamports) accrued to a `staked` balance at accumulator `acc`.
pub fn accrued(staked: u64, acc: u128) -> Result<u128> {
    u128::from(staked)
        .checked_mul(acc)
        .map(|product| product / ACC_SCALE)
        .ok_or(AttentionError::MathOverflow.into())
}

/// Unsettled revenue for a position: `accrued(staked, acc) - reward_debt`.
pub fn pending(staked: u64, acc: u128, reward_debt: u128) -> Result<u64> {
    let owed = accrued(staked, acc)?
        .checked_sub(reward_debt)
        .ok_or(AttentionError::MathOverflow)?;
    u64::try_from(owed).map_err(|_| AttentionError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE_SOL: u64 = 1_000_000_000;

    #[test]
    fn deposit_splits_pro_rata() {
        // Holder A holds 3 shares, B holds 1 share (4 total). Deposit 1 SOL.
        let total = 4_000_000u64;
        let a = 3_000_000u64;
        let b = 1_000_000u64;
        let acc = acc_increment(ONE_SOL, total).unwrap();

        // Fresh positions start with reward_debt 0.
        let a_pending = pending(a, acc, 0).unwrap();
        let b_pending = pending(b, acc, 0).unwrap();

        assert_eq!(a_pending, ONE_SOL / 4 * 3, "A gets 3/4");
        assert_eq!(b_pending, ONE_SOL / 4, "B gets 1/4");
        assert_eq!(a_pending + b_pending, ONE_SOL, "no revenue lost");
    }

    #[test]
    fn reward_debt_excludes_pre_stake_revenue() {
        // A stakes, 1 SOL deposited, then B stakes: B must not claim the earlier deposit.
        let a = 1_000_000u64;
        let acc_after_first = acc_increment(ONE_SOL, a).unwrap();

        // B joins now; its reward_debt snapshots the current accumulator.
        let b = 1_000_000u64;
        let b_debt = accrued(b, acc_after_first).unwrap();
        assert_eq!(
            pending(b, acc_after_first, b_debt).unwrap(),
            0,
            "B owed nothing for revenue before it staked"
        );

        // A second 1 SOL deposit is now split across 2 shares.
        let acc2 = acc_after_first + acc_increment(ONE_SOL, a + b).unwrap();
        assert_eq!(pending(b, acc2, b_debt).unwrap(), ONE_SOL / 2);
        assert_eq!(pending(a, acc2, 0).unwrap(), ONE_SOL + ONE_SOL / 2);
    }

    #[test]
    fn deposit_with_no_stakers_is_rejected() {
        assert!(acc_increment(ONE_SOL, 0).is_err());
    }
}
