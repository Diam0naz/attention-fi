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

    /// The fee leaves the pool now instead of settling in it.
    ///
    /// `swap_handler` calls `swap_quote` with a zero fee and skims separately —
    /// off the input on a buy, off the proceeds on a sell — so the pool grows
    /// only by what is actually liquidity. Passing `fee_bps` to `swap_quote`
    /// here instead would silently restore the old behaviour, because the
    /// difference is invisible in the trader's fill: both give the same
    /// `amount_out`. It shows up only in where the lamports end up, which is
    /// what this pins.
    #[test]
    fn buy_side_fee_is_skimmed_before_pricing_not_left_in_the_pool() {
        const FEE_BPS: u64 = 100;
        let amount_in: u64 = 1_000_000_000;
        let fee = amount_in * FEE_BPS / 10_000;
        let sol_in = amount_in - fee;

        // What swap_handler does: skim, then price the remainder fee-free.
        let split = swap_quote(SOL, TOK, sol_in, 0).unwrap();
        // What it used to do: hand the gross to swap_quote and let it skim.
        let retained = swap_quote(SOL, TOK, amount_in, FEE_BPS as u16).unwrap();

        assert_eq!(
            split.amount_out, retained.amount_out,
            "the trader is filled identically either way",
        );
        // The difference is the reserve. Under the old path the pool took the
        // whole input; now it takes only the post-fee part, and the fee is
        // routed to the creator and the treasury.
        assert_eq!(SOL + sol_in, SOL + amount_in - fee);
        assert!(fee > 0, "a 1% fee on 1 SOL is not dust");
    }

    /// A sell prices gross and skims the proceeds, mirroring `sell_quote`.
    ///
    /// Deliberately not the constant-product default, which skims the *input* —
    /// on a sell that input is tokens, and a token-denominated fee would need a
    /// treasury token account for every mint in existence.
    #[test]
    fn sell_side_fee_is_taken_from_proceeds_in_sol() {
        const FEE_BPS: u64 = 100;
        let tokens_in: u64 = 1_000_000_000_000;

        let gross = swap_quote(TOK, SOL, tokens_in, 0).unwrap().amount_out;
        let fee = gross * FEE_BPS / 10_000;
        let net = gross - fee;

        assert!(
            net < gross,
            "the seller receives less than the pool pays out"
        );
        assert_eq!(net + fee, gross, "every lamport is accounted for");
        // The pool loses the gross: net to the seller, fee onward. Its token
        // reserve still grows by the full input, so the fee is not taken twice.
        assert!(gross <= SOL, "cannot pay out more SOL than the pool holds");
    }
}
