//! Bounds on the protocol's tunable economic parameters.
//!
//! Everything in `Global` and `FeeConfig` was write-once at `initialize`, which
//! meant retuning a fee — or fixing one set wrong — took a redeploy. These
//! checks are what make the values safe to change on a live protocol instead.
//!
//! The point of every bound here is that an admin key is a key, not a
//! character reference: a fat-fingered `10000` where `100` was meant would take
//! 100% of a trade, and the config instruction is the only thing standing
//! between that typo and every trader on the protocol. Each limit is set where
//! a legitimate business decision stops and a mistake begins — deliberately
//! loose enough that the protocol can be retuned, tight enough that no single
//! call can make it predatory.
//!
//! Pure functions so the bounds are unit-tested off-chain.

use crate::error::AttentionError;
use anchor_lang::prelude::*;

/// 100% in basis points.
const BPS_DENOMINATOR: u16 = 10_000;

/// Highest fee the config accepts, for trading or for the NFT market (10%).
///
/// Well above anything the protocol intends to charge — the curve takes 1% and
/// the NFT market 2.5% — because this is not the pricing policy, it is the
/// ceiling that keeps a mistyped policy from becoming an expropriation.
pub const MAX_FEE_BPS: u16 = 1_000;

/// A trading or marketplace fee, in bps of the amount traded.
pub fn validate_fee_bps(fee_bps: u16) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, AttentionError::InvalidConfig);
    Ok(())
}

/// The creator's cut of each trading fee, in bps **of the fee**.
///
/// The full range is legitimate: 0 sends the whole fee to the treasury, 10,000
/// sends all of it to creators. Both are real positions on how the protocol
/// should be funded, and neither can overcharge a trader, because this splits a
/// fee that has already been bounded rather than adding to it.
pub fn validate_creator_share_bps(share_bps: u16) -> Result<()> {
    require!(share_bps <= BPS_DENOMINATOR, AttentionError::InvalidConfig);
    Ok(())
}

/// The SOL a curve must raise before it graduates to the AMM.
///
/// Read live on every buy, so lowering it can graduate curves that are already
/// past the new threshold on their next trade — intended, and the reason it is
/// tunable at all. Zero would graduate every curve on its first buy, stranding
/// the token in an AMM pool with no liquidity behind it.
pub fn validate_graduation_sol(lamports: u64) -> Result<()> {
    require!(lamports > 0, AttentionError::InvalidConfig);
    Ok(())
}

/// Virtual token reserves seeded into new curves.
///
/// Only affects launches made after the change — a curve snapshots this at
/// launch — so it can never reprice a token someone already holds. Zero would
/// divide by nothing on the first quote.
pub fn validate_virtual_token_reserves(reserves: u64) -> Result<()> {
    require!(reserves > 0, AttentionError::InvalidConfig);
    Ok(())
}

/// Most a day of promoted placement may be priced at (10 SOL).
///
/// A ceiling as well as a floor, because `promote_listing` charges whatever
/// this says at the moment the transaction lands. Without an upper bound a
/// retune — or a compromised authority — could turn a pending 0.09 SOL
/// promotion into an arbitrary debit against a payer who saw a different
/// number when they signed. Set far above any sane price so it constrains
/// mistakes and malice rather than policy.
pub const MAX_PROMO_LAMPORTS_PER_DAY: u64 = 10 * 1_000_000_000;

/// The daily price of promoted placement.
///
/// Must cost something. Free promotion isn't a generous setting, it's a broken
/// one: the ranking it feeds is only meaningful because buying it is a real
/// commitment, and at zero every listing can promote itself forever.
pub fn validate_promo_price(lamports_per_day: u64) -> Result<()> {
    require!(lamports_per_day > 0, AttentionError::InvalidConfig);
    require!(
        lamports_per_day <= MAX_PROMO_LAMPORTS_PER_DAY,
        AttentionError::InvalidConfig
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{
        DEFAULT_CREATOR_FEE_SHARE_BPS, DEFAULT_FEE_BPS, DEFAULT_GRADUATION_SOL,
        DEFAULT_NFT_FEE_BPS, DEFAULT_VIRTUAL_TOKEN_RESERVES, PROMO_LAMPORTS_PER_DAY,
    };

    #[test]
    fn every_shipped_default_passes_its_own_check() {
        // A bound that rejects the value the protocol launched with is a bound
        // that's wrong, not a config that is.
        validate_fee_bps(DEFAULT_FEE_BPS).unwrap();
        validate_fee_bps(DEFAULT_NFT_FEE_BPS).unwrap();
        validate_creator_share_bps(DEFAULT_CREATOR_FEE_SHARE_BPS).unwrap();
        validate_graduation_sol(DEFAULT_GRADUATION_SOL).unwrap();
        validate_virtual_token_reserves(DEFAULT_VIRTUAL_TOKEN_RESERVES).unwrap();
        validate_promo_price(PROMO_LAMPORTS_PER_DAY).unwrap();
    }

    #[test]
    fn a_fee_cannot_be_raised_past_the_ceiling() {
        assert!(validate_fee_bps(MAX_FEE_BPS).is_ok());
        assert!(validate_fee_bps(MAX_FEE_BPS + 1).is_err());
        // The classic slip: bps and percent confused, asking for 100%.
        assert!(validate_fee_bps(10_000).is_err());
    }

    #[test]
    fn a_fee_may_be_waived_entirely() {
        // Zero is a real policy — a promotional period with no fee — and must
        // not be confused with an unset value.
        assert!(validate_fee_bps(0).is_ok());
    }

    #[test]
    fn the_creator_split_spans_the_whole_range_but_no_further() {
        for share in [0, 1, 5_000, BPS_DENOMINATOR] {
            assert!(validate_creator_share_bps(share).is_ok(), "share {share}");
        }
        assert!(validate_creator_share_bps(BPS_DENOMINATOR + 1).is_err());
    }

    #[test]
    fn placement_is_priced_between_a_floor_and_a_ceiling() {
        assert!(validate_promo_price(MAX_PROMO_LAMPORTS_PER_DAY).is_ok());
        assert!(
            validate_promo_price(MAX_PROMO_LAMPORTS_PER_DAY + 1).is_err(),
            "an unbounded price is charged to whoever's transaction lands next"
        );
    }

    #[test]
    fn parameters_that_would_divide_by_nothing_are_rejected() {
        assert!(validate_graduation_sol(0).is_err());
        assert!(validate_virtual_token_reserves(0).is_err());
        assert!(validate_promo_price(0).is_err());

        assert!(validate_graduation_sol(1).is_ok());
        assert!(validate_virtual_token_reserves(1).is_ok());
        assert!(validate_promo_price(1).is_ok());
    }
}
