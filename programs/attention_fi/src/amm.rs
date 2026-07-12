//! Native constant-product AMM — the post-graduation trading venue.
//!
//! When a bonding curve reaches the graduation threshold, its real SOL + remaining
//! tokens migrate into an [`AmmPool`](crate::state::AmmPool) that trades `x*y=k`.
//! The swap fee is retained in the pool (growing protocol-owned liquidity) rather
//! than routed out — the simplest correct model; creator/LP fee splits on swaps are
//! a later refinement. Pricing is pure and unit-tested here.

use crate::curve::{ceil_div, mul_div};
use crate::error::AttentionError;
use anchor_lang::prelude::*;

const BPS_DENOMINATOR: u128 = 10_000;

/// Output of a constant-product swap.
pub struct SwapQuote {
    /// Amount of the output reserve delivered to the trader.
    pub amount_out: u64,
    /// Fee (in input units) skimmed before pricing; retained in the pool.
    pub fee: u64,
}

/// Swap `amount_in` of the input reserve for the output reserve, fee skimmed from
/// the input. Output is rounded down so the pool is never over-drawn.
pub fn swap_quote(
    reserve_in: u64,
    reserve_out: u64,
    amount_in: u64,
    fee_bps: u16,
) -> Result<SwapQuote> {
    let fee = mul_div(u128::from(amount_in), u128::from(fee_bps), BPS_DENOMINATOR)?;
    let in_after_fee = u128::from(amount_in)
        .checked_sub(fee)
        .ok_or(AttentionError::MathOverflow)?;

    let reserve_in = u128::from(reserve_in);
    let reserve_out = u128::from(reserve_out);
    let k = reserve_in
        .checked_mul(reserve_out)
        .ok_or(AttentionError::MathOverflow)?;
    let new_in = reserve_in
        .checked_add(in_after_fee)
        .ok_or(AttentionError::MathOverflow)?;
    // Round the new output reserve UP so the trader receives slightly less.
    let new_out = ceil_div(k, new_in)?;
    let amount_out = reserve_out
        .checked_sub(new_out)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(SwapQuote {
        amount_out: u64::try_from(amount_out).map_err(|_| AttentionError::MathOverflow)?,
        fee: u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOL: u64 = 85_000_000_000; // 85 SOL migrated
    const TOK: u64 = 200_000_000_000_000; // 200M tokens migrated

    #[test]
    fn buy_takes_fee_and_returns_tokens() {
        let q = swap_quote(SOL, TOK, 1_000_000_000, 100).unwrap();
        assert_eq!(q.fee, 10_000_000, "1% fee on 1 SOL");
        assert!(q.amount_out > 0 && q.amount_out < TOK);
    }

    #[test]
    fn buy_raises_price() {
        // price = sol/tok. After a SOL-in buy, sol up + tok down => price up.
        let q = swap_quote(SOL, TOK, 1_000_000_000, 0).unwrap();
        let before = SOL as u128 * TOK as u128; // compare via cross-multiplication
        let after_num = (SOL as u128 + 1_000_000_000) * (TOK as u128 - q.amount_out as u128);
        assert!(after_num >= before, "constant product preserved (>= k)");
    }

    #[test]
    fn roundtrip_only_loses_fees() {
        // Buy tokens with 1 SOL (no fee), then sell them straight back (no fee).
        let buy = swap_quote(SOL, TOK, 1_000_000_000, 0).unwrap();
        let sell =
            swap_quote(TOK - buy.amount_out, SOL + 1_000_000_000, buy.amount_out, 0).unwrap();
        assert!(
            sell.amount_out <= 1_000_000_000,
            "roundtrip cannot mint SOL"
        );
        assert!(1_000_000_000 - sell.amount_out < 1_000, "loss is dust");
    }

    #[test]
    fn output_never_exceeds_reserve() {
        let q = swap_quote(SOL, TOK, 1_000_000 * SOL, 0).unwrap();
        assert!(q.amount_out < TOK);
    }
}
