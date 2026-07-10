//! Constant-product virtual-reserve bonding-curve math.
//!
//! The curve holds *virtual* SOL/token reserves (`k = virtual_sol * virtual_token`)
//! plus the *real* SOL/token that has actually flowed in and out. Price is
//! `virtual_sol / virtual_token`. A token's mindshare tier seeds the starting
//! `virtual_sol_reserves`, so a high-tier subject launches at a higher price
//! instead of at zero (the core difference from Pump.fun).
//!
//! Every quote here is a pure integer function so it can be unit-tested off-chain
//! without a validator.

use crate::error::AttentionError;
use anchor_lang::prelude::*;

const BPS_DENOMINATOR: u128 = 10_000;

/// Tokens the buyer receives and the fee skimmed from their SOL.
pub struct BuyQuote {
    /// Tokens delivered to the buyer from the curve vault.
    pub tokens_out: u64,
    /// Fee (lamports) routed to the protocol treasury.
    pub fee: u64,
    /// Lamports added to the curve reserves (`sol_amount - fee`).
    pub sol_into_curve: u64,
}

/// SOL the seller receives and the fee skimmed from the gross proceeds.
pub struct SellQuote {
    /// Net lamports paid to the seller after fee.
    pub sol_out: u64,
    /// Fee (lamports) routed to the protocol treasury.
    pub fee: u64,
    /// Gross lamports removed from the curve reserves (`sol_out + fee`).
    pub sol_from_curve: u64,
}

/// Quote a buy: spend `sol_amount` lamports, receive tokens along the curve.
///
/// The fee is taken off the top; the remainder moves the curve. `tokens_out` is
/// clamped to `real_token` so the vault can never be over-drawn.
pub fn buy_quote(
    virtual_sol: u64,
    virtual_token: u64,
    real_token: u64,
    sol_amount: u64,
    fee_bps: u16,
) -> Result<BuyQuote> {
    let fee = mul_div(u128::from(sol_amount), u128::from(fee_bps), BPS_DENOMINATOR)?;
    let sol_in = u128::from(sol_amount)
        .checked_sub(fee)
        .ok_or(AttentionError::MathOverflow)?;

    let k = u128::from(virtual_sol)
        .checked_mul(u128::from(virtual_token))
        .ok_or(AttentionError::MathOverflow)?;
    let new_virtual_sol = u128::from(virtual_sol)
        .checked_add(sol_in)
        .ok_or(AttentionError::MathOverflow)?;
    // Constant product: keep product >= k by rounding the new reserve UP, so the
    // buyer receives slightly fewer tokens and rounding never favours the trader.
    let new_virtual_token = ceil_div(k, new_virtual_sol)?;
    let mut tokens_out = u128::from(virtual_token)
        .checked_sub(new_virtual_token)
        .ok_or(AttentionError::MathOverflow)?;

    if tokens_out > u128::from(real_token) {
        tokens_out = u128::from(real_token);
    }

    Ok(BuyQuote {
        tokens_out: to_u64(tokens_out)?,
        fee: to_u64(fee)?,
        sol_into_curve: to_u64(sol_in)?,
    })
}

/// Quote a sell: return `token_amount` tokens to the curve, receive SOL.
///
/// The gross proceeds are computed from the constant product, then the fee is
/// skimmed before paying the seller.
pub fn sell_quote(
    virtual_sol: u64,
    virtual_token: u64,
    token_amount: u64,
    fee_bps: u16,
) -> Result<SellQuote> {
    let k = u128::from(virtual_sol)
        .checked_mul(u128::from(virtual_token))
        .ok_or(AttentionError::MathOverflow)?;
    let new_virtual_token = u128::from(virtual_token)
        .checked_add(u128::from(token_amount))
        .ok_or(AttentionError::MathOverflow)?;
    // Round the new SOL reserve UP so the seller receives slightly less and the
    // curve is never over-drawn by rounding.
    let new_virtual_sol = ceil_div(k, new_virtual_token)?;
    let sol_from_curve = u128::from(virtual_sol)
        .checked_sub(new_virtual_sol)
        .ok_or(AttentionError::MathOverflow)?;

    let fee = mul_div(sol_from_curve, u128::from(fee_bps), BPS_DENOMINATOR)?;
    let sol_out = sol_from_curve
        .checked_sub(fee)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(SellQuote {
        sol_out: to_u64(sol_out)?,
        fee: to_u64(fee)?,
        sol_from_curve: to_u64(sol_from_curve)?,
    })
}

/// Integer ceiling division: `ceil(a / b)`. Used so constant-product rounding
/// always favours the curve over the trader.
fn ceil_div(a: u128, b: u128) -> Result<u128> {
    if b == 0 {
        return Err(AttentionError::MathOverflow.into());
    }
    let numerator = a.checked_add(b - 1).ok_or(AttentionError::MathOverflow)?;
    Ok(numerator / b)
}

fn mul_div(a: u128, b: u128, denominator: u128) -> Result<u128> {
    a.checked_mul(b)
        .and_then(|product| product.checked_div(denominator))
        .ok_or(AttentionError::MathOverflow.into())
}

fn to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| AttentionError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Pump-style defaults: 30 SOL virtual, 1.073B tokens (6 decimals) virtual,
    // 1B real tokens in the vault.
    const V_SOL: u64 = 30_000_000_000;
    const V_TOKEN: u64 = 1_073_000_000_000_000;
    const REAL_TOKEN: u64 = 1_000_000_000_000_000;
    const ONE_SOL: u64 = 1_000_000_000;

    fn price_num_den(virtual_sol: u64, virtual_token: u64) -> (u128, u128) {
        (u128::from(virtual_sol), u128::from(virtual_token))
    }

    #[test]
    fn buy_returns_tokens_and_takes_fee() {
        let q = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, ONE_SOL, 100).unwrap();
        assert!(q.tokens_out > 0, "buyer should receive tokens");
        assert_eq!(q.fee, ONE_SOL / 100, "1% fee on 1 SOL");
        assert_eq!(q.sol_into_curve, ONE_SOL - q.fee);
    }

    #[test]
    fn buy_raises_the_price() {
        let (n0, d0) = price_num_den(V_SOL, V_TOKEN);
        let q = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, ONE_SOL, 0).unwrap();
        let (n1, d1) = price_num_den(V_SOL + q.sol_into_curve, V_TOKEN - q.tokens_out);
        // price1 > price0  <=>  n1*d0 > n0*d1
        assert!(n1 * d0 > n0 * d1, "each buy must push the price up");
    }

    #[test]
    fn higher_tier_seed_starts_at_higher_price() {
        // Same virtual token supply, larger virtual SOL seed => higher start price.
        let low = price_num_den(500_000_000, V_TOKEN); // ~new entrant
        let high = price_num_den(100_000_000_000, V_TOKEN); // ~top 10
        assert!(high.0 * low.1 > low.0 * high.1);
    }

    #[test]
    fn buy_clamps_to_real_token_reserves() {
        // A buy far larger than the vault can never deliver more than real_token.
        let huge = 1_000_000 * ONE_SOL;
        let q = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, huge, 0).unwrap();
        assert!(q.tokens_out <= REAL_TOKEN);
    }

    #[test]
    fn buy_then_sell_roundtrip_only_loses_fees() {
        // Buy with no fee, then immediately sell the tokens back with no fee.
        let buy = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, ONE_SOL, 0).unwrap();
        let sell = sell_quote(
            V_SOL + buy.sol_into_curve,
            V_TOKEN - buy.tokens_out,
            buy.tokens_out,
            0,
        )
        .unwrap();
        // Constant-product floor rounding means you get back at most what you paid.
        assert!(sell.sol_out <= ONE_SOL, "roundtrip cannot mint SOL");
        // ...and the loss is only dust from integer flooring.
        assert!(
            ONE_SOL - sell.sol_out < 1_000,
            "roundtrip loss should be dust"
        );
    }

    #[test]
    fn sell_fee_is_skimmed_from_gross() {
        let sell = sell_quote(V_SOL, V_TOKEN, 1_000_000_000_000, 100).unwrap();
        assert_eq!(sell.sol_out + sell.fee, sell.sol_from_curve);
        assert_eq!(sell.fee, sell.sol_from_curve / 100);
    }

    #[test]
    fn zero_amount_buy_yields_zero_tokens() {
        let q = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, 0, 100).unwrap();
        assert_eq!(q.tokens_out, 0);
        assert_eq!(q.fee, 0);
    }
}
