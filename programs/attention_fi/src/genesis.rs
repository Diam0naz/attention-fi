//! Accounting for a token's genesis group — a fixed-price run of fee-share NFTs.
//!
//! `mint_genesis` sells fee-share NFTs one at a time, priced and negotiated
//! off-chain by the creator. A genesis *group* is the retail version of the same
//! thing: the creator declares up front how many units exist, what slice of
//! their fee stream each one carries and what a unit costs, then anyone can take
//! one at that price until they run out.
//!
//! Three counts move independently and each has its own ceiling, which is why
//! they get their own functions rather than being open-coded at three call
//! sites: units minted can never exceed the declared total, units sold can never
//! exceed units minted, and units bought by one wallet can never exceed the
//! per-wallet cap. The cap is what stops the whole run landing in one buyer's
//! hands in the first block — the point of a genesis group is a spread of early
//! holders, not a cheaper way to sell the lot to a single bidder.
//!
//! All functions are pure so the arithmetic is unit-tested off-chain.

use crate::error::AttentionError;
use anchor_lang::prelude::*;

/// 100% in basis points.
const BPS_DENOMINATOR: u64 = 10_000;

/// Most units one `mint_genesis_batch` call will create.
///
/// Each unit is a separate `CreateV2` CPI, so the real ceiling is the compute
/// budget rather than anything on-chain; this bounds a call to something a
/// client can reliably land (with a raised compute limit) and turns the failure
/// into a named error instead of an opaque exhaustion. Filling a larger group
/// takes several calls, which the running `minted_units` count already supports.
pub const MAX_GENESIS_BATCH: usize = 10;

/// Total slice of the creator's fee stream a full group represents, in bps.
pub fn group_share_bps(total_units: u16, share_bps: u16) -> Result<u64> {
    u64::from(total_units)
        .checked_mul(u64::from(share_bps))
        .ok_or_else(|| AttentionError::MathOverflow.into())
}

/// Check a proposed group against the token's already-committed fee share.
///
/// `committed_share_bps` is the subject token's `GenesisPool::total_share_bps` —
/// what previous genesis NFTs (grouped or one-off) already claim. A group that
/// would push the total past 100% is rejected at listing rather than at the sale
/// that crosses the line: `split_genesis_fee` clamps an oversubscribed stream,
/// so the overflow would silently dilute every existing holder instead of
/// failing, and the buyer who caused it would have paid full price for a share
/// that cannot be honoured.
pub fn validate_group(
    total_units: u16,
    share_bps: u16,
    per_wallet_cap: u16,
    price: u64,
    committed_share_bps: u64,
) -> Result<()> {
    require!(total_units > 0, AttentionError::InvalidGenesisGroup);
    require!(share_bps > 0, AttentionError::InvalidGenesisGroup);
    // A free unit is a giveaway, not a listing — `mint_genesis` already hands
    // one to a named recipient without charging, and at zero the per-wallet cap
    // is the only thing between the fee stream and whoever scripts fastest.
    require!(price > 0, AttentionError::InvalidGenesisGroup);
    require!(
        per_wallet_cap > 0 && per_wallet_cap <= total_units,
        AttentionError::InvalidGenesisGroup
    );

    let committed = committed_share_bps
        .checked_add(group_share_bps(total_units, share_bps)?)
        .ok_or(AttentionError::MathOverflow)?;
    require!(
        committed <= BPS_DENOMINATOR,
        AttentionError::InvalidGenesisGroup
    );
    Ok(())
}

/// Check one more NFT's share against what a token's fee stream already owes.
///
/// The group path has always been capped at listing time, but the one-off
/// `mint_genesis` path was not: it bounded each NFT to 10,000 bps individually
/// and then added to `GenesisPool::total_share_bps` unconditionally. Since that
/// total is the denominator every payout is divided by, a creator could sell a
/// run at a stated percentage and afterwards mint themselves NFTs until the
/// buyers' share rounded to nothing — taking their money and then removing what
/// they bought. The cap has to live on both paths or it protects neither.
pub fn validate_added_share(committed_share_bps: u64, share_bps: u16) -> Result<()> {
    require!(share_bps > 0, AttentionError::InvalidGenesisGroup);
    let committed = committed_share_bps
        .checked_add(u64::from(share_bps))
        .ok_or(AttentionError::MathOverflow)?;
    require!(
        committed <= BPS_DENOMINATOR,
        AttentionError::ShareOversubscribed
    );
    Ok(())
}

/// New `minted_units` after adding `batch` units, or an error if the group is
/// full. Also rejects an empty or oversized batch, so a call that would mint
/// nothing fails loudly instead of costing a fee for no effect.
pub fn record_mint(minted: u16, total: u16, batch: usize) -> Result<u16> {
    require!(
        batch > 0 && batch <= MAX_GENESIS_BATCH,
        AttentionError::InvalidGenesisBatch
    );
    let batch = u16::try_from(batch).map_err(|_| AttentionError::InvalidGenesisBatch)?;
    let minted = minted
        .checked_add(batch)
        .ok_or(AttentionError::MathOverflow)?;
    require!(minted <= total, AttentionError::GenesisGroupFull);
    Ok(minted)
}

/// New `sold_units` after one sale.
///
/// Bounded by units *minted*, not by the declared total: a group can be filled
/// over several batches, and until a unit exists there is nothing to hand over.
pub fn record_sale(sold: u16, minted: u16) -> Result<u16> {
    let sold = sold.checked_add(1).ok_or(AttentionError::MathOverflow)?;
    require!(sold <= minted, AttentionError::SoldOut);
    Ok(sold)
}

/// New per-wallet unit count after one purchase, or `WalletCapReached`.
pub fn record_allocation(units: u16, cap: u16) -> Result<u16> {
    let units = units.checked_add(1).ok_or(AttentionError::MathOverflow)?;
    require!(units <= cap, AttentionError::WalletCapReached);
    Ok(units)
}

/// New `minted_units` after the creator takes `batch` unsold units back.
///
/// Only what is still in escrow can be reclaimed — `minted - sold` — and the
/// count comes down rather than a separate tally going up, so `sold <= minted`
/// keeps meaning "every unit that exists is either escrowed or sold". Letting
/// the count stand would leave a group that reads as part-full forever and
/// would let `record_sale` promise units the escrow no longer holds.
pub fn record_reclaim(minted: u16, sold: u16, batch: usize) -> Result<u16> {
    require!(
        batch > 0 && batch <= MAX_GENESIS_BATCH,
        AttentionError::InvalidGenesisBatch
    );
    let batch = u16::try_from(batch).map_err(|_| AttentionError::InvalidGenesisBatch)?;
    let escrowed = minted
        .checked_sub(sold)
        .ok_or(AttentionError::MathOverflow)?;
    require!(batch <= escrowed, AttentionError::NoUnitsToReclaim);
    minted
        .checked_sub(batch)
        .ok_or_else(|| AttentionError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRICE: u64 = 100_000_000;

    #[test]
    fn a_full_group_can_sell_the_whole_fee_stream_but_no_more() {
        // 10 units x 1000 bps == 100% of the creator's cut, exactly.
        assert!(validate_group(10, 1_000, 2, PRICE, 0).is_ok());
        // One more unit at the same share oversubscribes it.
        assert!(validate_group(11, 1_000, 2, PRICE, 0).is_err());
    }

    #[test]
    fn shares_already_sold_count_against_the_group() {
        // A creator who hand-minted 60% of their stream can only group the rest.
        assert!(validate_group(4, 1_000, 1, PRICE, 6_000).is_ok());
        assert!(validate_group(5, 1_000, 1, PRICE, 6_000).is_err());
    }

    #[test]
    fn a_group_must_offer_something_at_a_price() {
        assert!(validate_group(0, 1_000, 1, PRICE, 0).is_err(), "no units");
        assert!(validate_group(5, 0, 1, PRICE, 0).is_err(), "no share");
        assert!(validate_group(5, 1_000, 1, 0, 0).is_err(), "no price");
    }

    #[test]
    fn the_cap_must_be_a_real_limit_on_a_real_run() {
        assert!(
            validate_group(5, 1_000, 0, PRICE, 0).is_err(),
            "cap of zero"
        );
        // A cap at or above the total is legal — it just doesn't bind.
        assert!(validate_group(5, 1_000, 5, PRICE, 0).is_ok());
        assert!(
            validate_group(5, 1_000, 6, PRICE, 0).is_err(),
            "a cap past the whole run is a typo, not a policy"
        );
    }

    #[test]
    fn group_share_cannot_overflow_the_check_it_feeds() {
        // Both maxed: the product exceeds u16 and must survive as u64 rather
        // than wrapping into a value that passes the 100% test.
        assert_eq!(
            group_share_bps(u16::MAX, u16::MAX).unwrap(),
            u64::from(u16::MAX) * u64::from(u16::MAX)
        );
        assert!(validate_group(u16::MAX, u16::MAX, 1, PRICE, 0).is_err());
    }

    #[test]
    fn minting_stops_at_the_declared_total() {
        assert_eq!(record_mint(0, 10, 6).unwrap(), 6);
        // The group fills over several calls.
        assert_eq!(record_mint(6, 10, 4).unwrap(), 10);
        assert!(record_mint(10, 10, 1).is_err());
        // A batch that would overshoot is rejected whole, not truncated.
        assert!(record_mint(6, 10, 5).is_err());
    }

    #[test]
    fn a_batch_must_be_between_one_and_the_ceiling() {
        assert!(record_mint(0, 100, 0).is_err());
        assert!(record_mint(0, 100, MAX_GENESIS_BATCH).is_ok());
        assert!(record_mint(0, 100, MAX_GENESIS_BATCH + 1).is_err());
    }

    #[test]
    fn sales_are_bounded_by_units_that_exist_not_units_promised() {
        // 10 declared, 3 minted so far: the fourth sale has nothing to hand over.
        assert_eq!(record_sale(0, 3).unwrap(), 1);
        assert_eq!(record_sale(2, 3).unwrap(), 3);
        assert!(record_sale(3, 3).is_err());
    }

    #[test]
    fn a_single_mint_cannot_push_the_stream_past_itself() {
        // The rug this closes: a run of 10 x 100bps has sold, committing 1000.
        // The creator may still issue 90% more, but not a basis point beyond.
        assert!(validate_added_share(1_000, 9_000).is_ok());
        assert!(validate_added_share(1_000, 9_001).is_err());
        // And once the stream is fully committed, nothing more can be added.
        assert!(validate_added_share(10_000, 1).is_err());
        assert!(validate_added_share(0, 10_000).is_ok());
    }

    #[test]
    fn an_already_oversubscribed_pool_cannot_be_pushed_further() {
        // Pools minted before the cap existed can already exceed 100%. They
        // must not be made worse, and the check must not overflow reasoning
        // about them.
        assert!(validate_added_share(25_000, 1).is_err());
        assert!(validate_added_share(u64::MAX, 1).is_err());
        assert!(
            validate_added_share(0, 0).is_err(),
            "a zero share earns nothing"
        );
    }

    #[test]
    fn a_creator_can_only_take_back_what_is_still_escrowed() {
        // 5 minted, 2 sold: three are still in escrow.
        assert_eq!(record_reclaim(5, 2, 3).unwrap(), 2);
        assert!(
            record_reclaim(5, 2, 4).is_err(),
            "a sold unit belongs to its buyer, not the creator"
        );
        // Nothing left to take.
        assert!(record_reclaim(2, 2, 1).is_err());
    }

    #[test]
    fn reclaiming_leaves_the_sold_count_still_reachable() {
        // The invariant every other function leans on: after a reclaim, minted
        // must not drop below what has already been sold.
        for sold in 0..=5u16 {
            let escrowed = 5 - sold;
            if escrowed == 0 {
                continue;
            }
            let minted = record_reclaim(5, sold, usize::from(escrowed)).unwrap();
            assert_eq!(minted, sold, "everything unsold went back");
            assert!(
                record_sale(sold, minted).is_err(),
                "and nothing is left to sell"
            );
        }
    }

    #[test]
    fn one_wallet_cannot_take_more_than_its_cap() {
        assert_eq!(record_allocation(0, 2).unwrap(), 1);
        assert_eq!(record_allocation(1, 2).unwrap(), 2);
        assert!(record_allocation(2, 2).is_err());
    }
}
