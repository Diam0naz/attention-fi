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
    /// Lamports added to the curve reserves (`sol_amount - fee`, or less when
    /// the buy is clamped to the remaining supply).
    pub sol_into_curve: u64,
    /// Lamports actually taken from the buyer: `sol_into_curve + fee`. Equal to
    /// `sol_amount` unless the buy was clamped, in which case the buyer pays
    /// only for the tokens delivered.
    pub sol_charged: u64,
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
/// clamped to `real_token` so the vault can never be over-drawn, and a clamped
/// buy is charged only for the tokens it delivers: the SOL that moves the curve
/// to exactly `real_token` sold, plus the fee on that. Crediting the full
/// payment instead would let `real_sol` run past what the sold supply is worth
/// on the curve, and past the graduation threshold with no tokens left to seed
/// the pool.
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
    let tokens_out = u128::from(virtual_token)
        .checked_sub(new_virtual_token)
        .ok_or(AttentionError::MathOverflow)?;

    if tokens_out <= u128::from(real_token) {
        return Ok(BuyQuote {
            tokens_out: to_u64(tokens_out)?,
            fee: to_u64(fee)?,
            sol_into_curve: to_u64(sol_in)?,
            sol_charged: sol_amount,
        });
    }

    // Clamped: sell exactly `real_token`. The SOL that moves the curve there is
    // `ceil(k / (virtual_token - real_token)) - virtual_sol` (rounded up, so k
    // never decreases), and it is never more than `sol_in`, since the
    // unclamped buy went further.
    let tokens_out = u128::from(real_token);
    let target_virtual_token = u128::from(virtual_token)
        .checked_sub(tokens_out)
        .ok_or(AttentionError::MathOverflow)?;
    let needed = ceil_div(k, target_virtual_token)?
        .checked_sub(u128::from(virtual_sol))
        .ok_or(AttentionError::MathOverflow)?;
    // Gross the fee up on what's needed, so the fee rate is the same as on an
    // unclamped buy: charged - fee(charged) >= needed. Rounded up for the
    // protocol, and never above what the buyer offered.
    let keep = BPS_DENOMINATOR
        .checked_sub(u128::from(fee_bps))
        .ok_or(AttentionError::MathOverflow)?;
    let charged = ceil_div(
        needed
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(AttentionError::MathOverflow)?,
        keep,
    )?
    .min(u128::from(sol_amount));
    let fee = charged
        .checked_sub(needed)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(BuyQuote {
        tokens_out: to_u64(tokens_out)?,
        fee: to_u64(fee)?,
        sol_into_curve: to_u64(needed)?,
        sol_charged: to_u64(charged)?,
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

/// Split a collected trading `fee` into `(creator, treasury)` portions, where
/// `creator_share_bps` is the creator's share of the fee. Rounds the creator
/// cut down so the treasury is never shorted.
pub fn split_creator_fee(fee: u64, creator_share_bps: u16) -> Result<(u64, u64)> {
    let creator = mul_div(
        u128::from(fee),
        u128::from(creator_share_bps),
        BPS_DENOMINATOR,
    )?;
    let creator = u64::try_from(creator).map_err(|_| AttentionError::MathOverflow)?;
    let treasury = fee
        .checked_sub(creator)
        .ok_or(AttentionError::MathOverflow)?;
    Ok((creator, treasury))
}

/// Integer ceiling division: `ceil(a / b)`. Used so constant-product rounding
/// always favours the curve over the trader.
pub(crate) fn ceil_div(a: u128, b: u128) -> Result<u128> {
    if b == 0 {
        return Err(AttentionError::MathOverflow.into());
    }
    let numerator = a.checked_add(b - 1).ok_or(AttentionError::MathOverflow)?;
    Ok(numerator / b)
}

pub(crate) fn mul_div(a: u128, b: u128, denominator: u128) -> Result<u128> {
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
    fn clamped_buy_pays_only_for_what_it_receives() {
        // A curve with 1M tokens left, and a buy big enough to want far more.
        let left = 1_000_000_000_000;
        let v_token = left + 73_000_000_000_000;
        let q = buy_quote(V_SOL, v_token, left, 100 * ONE_SOL, 100).unwrap();
        assert_eq!(q.tokens_out, left);
        assert!(q.sol_charged < 100 * ONE_SOL, "the excess is never taken");
        assert_eq!(q.sol_charged, q.sol_into_curve + q.fee);
        // The curve moves exactly to `left` sold, and k never decreases.
        let k0 = u128::from(V_SOL) * u128::from(v_token);
        let k1 = u128::from(V_SOL + q.sol_into_curve) * u128::from(v_token - left);
        assert!(k1 >= k0);
        // ...and not by more than rounding: one lamport less wouldn't get there.
        let k_short = u128::from(V_SOL + q.sol_into_curve - 1) * u128::from(v_token - left);
        assert!(k_short < k0);
        // Same fee as an unclamped buy of `sol_charged` would pay (1%), rounded
        // up by at most a lamport.
        let unclamped_fee = q.sol_charged / 100;
        assert!(q.fee >= unclamped_fee && q.fee <= unclamped_fee + 1);
    }

    #[test]
    fn unclamped_buy_charges_the_full_amount() {
        let q = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, ONE_SOL, 100).unwrap();
        assert_eq!(q.sol_charged, ONE_SOL);
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
    fn creator_fee_splits_and_rounds_toward_treasury() {
        assert_eq!(split_creator_fee(1_000, 5_000).unwrap(), (500, 500));
        assert_eq!(split_creator_fee(1_000, 0).unwrap(), (0, 1_000));
        assert_eq!(split_creator_fee(1_000, 10_000).unwrap(), (1_000, 0));
        // Odd fee: creator cut floors, treasury keeps the remainder.
        assert_eq!(split_creator_fee(999, 5_000).unwrap(), (499, 500));
    }

    #[test]
    fn zero_amount_buy_yields_zero_tokens() {
        let q = buy_quote(V_SOL, V_TOKEN, REAL_TOKEN, 0, 100).unwrap();
        assert_eq!(q.tokens_out, 0);
        assert_eq!(q.fee, 0);
    }
}
