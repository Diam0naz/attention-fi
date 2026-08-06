//! Dutch-auction pricing math.
//!
//! Price starts at a ceiling and descends linearly to a floor over `duration`
//! seconds. A bot buying at `t = 0` pays the highest price, not the lowest, which
//! removes the front-running advantage — the fair-launch mechanism the strategy
//! brief specifies for narrative / project tokens.
//!
//! Prices are expressed as **lamports per whole token** (i.e. per `10^decimals`
//! base units). Every function here is pure so it can be unit-tested off-chain.

use crate::error::AttentionError;
use anchor_lang::prelude::*;

const BPS_DENOMINATOR: u128 = 10_000;

/// Cost of a bid plus the fee skimmed on top.
pub struct AuctionQuote {
    /// Lamports paid into the auction proceeds (price x amount).
    pub cost: u64,
    /// Fee (lamports) routed to the protocol treasury, charged on top of `cost`.
    pub fee: u64,
}

/// Validate the price/duration triple every listing path shares.
///
/// Three shapes are legal and they're worth naming, because the difference is
/// the whole product decision:
///
/// - **fixed, timed** — `start == floor`, `duration > 0`. Sits at one price,
///   then expires.
/// - **fixed, perpetual** — `start == floor`, `duration == 0`. Sits at one
///   price until sold or withdrawn. The sane default for a 1-of-1.
/// - **declining, timed** — `start > floor`, `duration > 0`. The Dutch
///   auction, now an explicit choice rather than the only option.
///
/// The fourth combination — declining and perpetual — is rejected. A descent
/// is defined by where it ends and when; without a deadline there is no
/// schedule, and the price would simply sit at the ceiling forever while
/// claiming to fall.
pub fn validate_listing(start_price: u64, floor_price: u64, duration: i64) -> Result<()> {
    require!(
        start_price >= floor_price,
        AttentionError::InvalidAuctionParams
    );
    require!(floor_price > 0, AttentionError::InvalidAuctionParams);
    require!(duration >= 0, AttentionError::InvalidAuctionParams);
    if is_perpetual(duration) {
        require!(
            start_price == floor_price,
            AttentionError::InvalidAuctionParams
        );
    }
    Ok(())
}

/// Whether a listing runs forever.
///
/// `duration == 0` is the perpetual listing: no deadline, no descent, no
/// countdown pressuring the seller into a price they didn't want. It is spelled
/// as a named predicate rather than a bare `== 0` because the same zero means
/// something dangerous in a time comparison — `now >= start_time + 0` is true
/// the instant a listing opens, so every deadline check has to ask this first.
pub fn is_perpetual(duration: i64) -> bool {
    duration == 0
}

/// Current price (lamports per whole token) at time `now` on a linear descent
/// from `start_price` down to `floor_price` over `duration` seconds.
///
/// A perpetual listing never descends: it sits at `start_price` until someone
/// buys it or the seller takes it down. Callers are expected to have rejected a
/// perpetual listing with `start_price != floor_price` at creation, since a
/// descent with no end has no schedule to follow.
pub fn current_price(
    start_price: u64,
    floor_price: u64,
    start_time: i64,
    duration: i64,
    now: i64,
) -> Result<u64> {
    require!(
        start_price >= floor_price,
        AttentionError::InvalidAuctionParams
    );
    if is_perpetual(duration) {
        return Ok(start_price);
    }
    require!(duration > 0, AttentionError::InvalidAuctionParams);

    let elapsed = now.saturating_sub(start_time);
    if elapsed <= 0 {
        return Ok(start_price);
    }
    if elapsed >= duration {
        return Ok(floor_price);
    }

    let span = u128::from(start_price - floor_price);
    // Linear interpolation; floor division means price is never *below* schedule,
    // so the auction is never underpaid.
    let drop = span
        .checked_mul(elapsed as u128)
        .and_then(|numerator| numerator.checked_div(duration as u128))
        .ok_or(AttentionError::MathOverflow)?;
    let drop = u64::try_from(drop).map_err(|_| AttentionError::MathOverflow)?;
    Ok(start_price - drop)
}

/// Quote the cost of buying `amount` base units at `price_per_token`
/// (lamports per whole token), plus the protocol fee.
pub fn auction_quote(
    price_per_token: u64,
    amount: u64,
    decimals: u8,
    fee_bps: u16,
) -> Result<AuctionQuote> {
    let scale = 10u128
        .checked_pow(u32::from(decimals))
        .ok_or(AttentionError::MathOverflow)?;
    // Round the cost UP so a partial base unit never underpays the auction.
    let numerator = u128::from(price_per_token)
        .checked_mul(u128::from(amount))
        .ok_or(AttentionError::MathOverflow)?;
    let cost = numerator
        .checked_add(scale - 1)
        .ok_or(AttentionError::MathOverflow)?
        / scale;
    let fee = cost
        .checked_mul(u128::from(fee_bps))
        .and_then(|product| product.checked_div(BPS_DENOMINATOR))
        .ok_or(AttentionError::MathOverflow)?;

    Ok(AuctionQuote {
        cost: u64::try_from(cost).map_err(|_| AttentionError::MathOverflow)?,
        fee: u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: u64 = 100_000_000; // 0.1 SOL per token ceiling
    const FLOOR: u64 = 10_000_000; // 0.01 SOL per token floor
    const T0: i64 = 1_000;
    const DUR: i64 = 1_000;

    #[test]
    fn price_starts_at_ceiling_before_and_at_start() {
        assert_eq!(current_price(START, FLOOR, T0, DUR, T0 - 5).unwrap(), START);
        assert_eq!(current_price(START, FLOOR, T0, DUR, T0).unwrap(), START);
    }

    #[test]
    fn price_hits_floor_at_and_after_end() {
        assert_eq!(
            current_price(START, FLOOR, T0, DUR, T0 + DUR).unwrap(),
            FLOOR
        );
        assert_eq!(
            current_price(START, FLOOR, T0, DUR, T0 + DUR + 999).unwrap(),
            FLOOR
        );
    }

    #[test]
    fn price_descends_monotonically() {
        let mut prev = u64::MAX;
        for step in 0..=10 {
            let now = T0 + (DUR * step) / 10;
            let p = current_price(START, FLOOR, T0, DUR, now).unwrap();
            assert!(p <= prev, "price must not rise over time");
            assert!((FLOOR..=START).contains(&p));
            prev = p;
        }
    }

    #[test]
    fn halfway_price_is_midpoint() {
        let p = current_price(START, FLOOR, T0, DUR, T0 + DUR / 2).unwrap();
        assert_eq!(p, (START + FLOOR) / 2);
    }

    #[test]
    fn cost_scales_with_amount_and_takes_fee() {
        // 1 whole token (1e6 base units at 6 decimals) at 0.1 SOL/token.
        let q = auction_quote(START, 1_000_000, 6, 100).unwrap();
        assert_eq!(q.cost, START, "1 token costs one unit of price");
        assert_eq!(q.fee, START / 100, "1% fee on top");
    }

    #[test]
    fn cost_rounds_up_for_partial_units() {
        // A sub-token amount must never round the cost down to zero underpayment.
        let q = auction_quote(START, 1, 6, 0).unwrap();
        assert!(q.cost >= 1, "dust purchase still costs at least 1 lamport");
    }

    #[test]
    fn invalid_params_rejected() {
        assert!(
            current_price(FLOOR, START, T0, DUR, T0).is_err(),
            "start < floor"
        );
        assert!(
            current_price(START, FLOOR, T0, -1, T0).is_err(),
            "negative duration"
        );
    }

    // Zero duration used to be an error. It now means "perpetual", so the tests
    // below pin the new contract rather than the old rejection.

    #[test]
    fn perpetual_listing_holds_its_price_forever() {
        for elapsed in [0, 1, DUR, 86_400 * 365 * 10] {
            assert_eq!(
                current_price(START, START, T0, 0, T0 + elapsed).unwrap(),
                START,
                "a perpetual listing must not drift"
            );
        }
    }

    #[test]
    fn fixed_timed_listing_never_moves_within_its_window() {
        for elapsed in [0, DUR / 3, DUR, DUR * 2] {
            assert_eq!(
                current_price(START, START, T0, DUR, T0 + elapsed).unwrap(),
                START
            );
        }
    }

    #[test]
    fn validate_accepts_the_three_legal_shapes() {
        validate_listing(START, START, 0).expect("fixed perpetual");
        validate_listing(START, START, DUR).expect("fixed timed");
        validate_listing(START, FLOOR, DUR).expect("declining timed");
    }

    #[test]
    fn validate_rejects_a_declining_perpetual_listing() {
        // A descent is defined by where it ends and when. Without a deadline
        // there's no schedule, so the price would sit at the ceiling forever
        // while claiming to fall.
        assert!(validate_listing(START, FLOOR, 0).is_err());
    }

    #[test]
    fn validate_rejects_free_and_inverted_listings() {
        assert!(validate_listing(START, 0, DUR).is_err(), "zero floor");
        assert!(
            validate_listing(FLOOR, START, DUR).is_err(),
            "start < floor"
        );
        assert!(validate_listing(START, FLOOR, -1).is_err(), "negative");
    }

    #[test]
    fn perpetual_is_only_zero() {
        // The predicate guards every deadline comparison in the program, so it
        // must not quietly treat a negative duration as perpetual.
        assert!(is_perpetual(0));
        assert!(!is_perpetual(1));
        assert!(!is_perpetual(-1));
    }
}
