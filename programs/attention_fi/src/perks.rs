//! Earning a perk, rather than being handed one.
//!
//! `PERK_LEVEL_ACTIVITY_LAMPORTS` has always described a ladder a trader climbs
//! by trading — 1, 5, 20, 75, 250 SOL of cumulative activity — and until now
//! nothing referenced it. `claim_perk` needed an admin-issued `PerkGrant` and
//! `level_up` needed the authority's signature, so the discount was something
//! the protocol handed out, not something anyone could earn. The thresholds
//! were a description of a system that didn't exist.
//!
//! These functions close that gap. The score they read comes from
//! [`crate::state::TraderStats`], written by the trading instructions
//! themselves, so both gates are arithmetic on-chain rather than a signature.
//!
//! Splitting volume across wallets is not an attack on this: the thresholds are
//! cumulative minimums held *per wallet*, so two wallets at half the volume
//! each reach a lower level than one wallet at full volume. There is nothing to
//! gain by fragmenting, which is why no anti-sybil machinery is needed here.
//!
//! All functions are pure so the ladder is unit-tested off-chain.

use crate::constants::{MAX_PERK_LEVEL, PERK_LEVEL_ACTIVITY_LAMPORTS};
use crate::error::AttentionError;
use crate::state::TraderStats;
use anchor_lang::prelude::*;

/// Book a trade against the trader's cumulative activity, if they keep any.
///
/// The account is optional on every trading instruction, and deliberately so.
/// The rule that decides it: an optional account is safe exactly when omitting
/// it hurts the caller. Skipping this one forfeits progress toward your own fee
/// discount and moves nobody else's economics by a lamport — the opposite of
/// the genesis pool, where omitting the account paid the omitter out of
/// somebody else's stream.
///
/// Optional to the *program*, which is not the same as optional to the client:
/// Anchor's TypeScript layer rejects a call that doesn't name every account,
/// including the ones it will send as None, so a TS caller must still pass
/// `traderStats: null` exactly as it already passes `perk: null`. What the
/// optionality buys is that a trade without the account is a valid trade, not
/// that existing call sites compile untouched.
///
/// `TraderStats` has to be opened once via `open_trader_stats` before it can be
/// passed. Creating it here with `init_if_needed` would put an account creation
/// on the hot path of every first trade, and silently charge rent to someone
/// who only asked to buy a token.
///
/// The address is pinned by seeds at the call site, so the account can only be
/// the signer's own; the owner check below is a cheap restatement of that.
///
/// Takes the record itself rather than the `Option<Account<..>>` wrapper: swap
/// boxes its accounts for stack reasons and the others don't, and a helper
/// generic over that difference would be harder to read than the one
/// `as_deref_mut()` each caller writes.
pub fn record_activity(
    stats: Option<&mut TraderStats>,
    owner: Pubkey,
    volume: u64,
    deposit: u64,
) -> Result<()> {
    let Some(stats) = stats else {
        return Ok(());
    };
    require_keys_eq!(stats.owner, owner, AttentionError::Unauthorized);
    let bump = stats.bump;
    stats.accrue(owner, bump, volume, deposit)
}

/// Cumulative activity required to hold `level`, or `None` past the ceiling.
///
/// Level 0 is "no perk" and costs nothing, so it has no entry: the table is
/// indexed from level 1, and asking about a level above the maximum is a
/// question with no answer rather than an error.
pub fn required_for_level(level: u8) -> Option<u64> {
    if level == 0 || level > MAX_PERK_LEVEL {
        return None;
    }
    PERK_LEVEL_ACTIVITY_LAMPORTS
        .get(usize::from(level) - 1)
        .copied()
}

/// The highest level `score` has earned — 0 when it hasn't earned any.
///
/// Walks the table rather than assuming a formula, because the thresholds are
/// deliberately non-linear (they quadruple, then triple) and a closed form
/// would have to be kept in step with them by hand.
pub fn level_for_score(score: u64) -> u8 {
    let mut level = 0u8;
    for step in 1..=MAX_PERK_LEVEL {
        match required_for_level(step) {
            Some(required) if score >= required => level = step,
            _ => break,
        }
    }
    level
}

/// Whether `score` entitles a wallet to claim its first perk.
///
/// Claiming mints at the level already earned rather than always at level 1: a
/// trader who crosses several thresholds before claiming would otherwise have
/// to send four more transactions to reach the level their volume already
/// bought, which is bookkeeping dressed up as progression.
pub fn level_for_claim(score: u64) -> Result<u8> {
    let level = level_for_score(score);
    require!(level >= 1, AttentionError::InsufficientActivity);
    Ok(level)
}

/// Check a wallet may move from `current` to the next level on `score`.
///
/// Returns the new level. Separate from [`level_for_score`] because levelling
/// is a step at a time: jumping straight to the earned level would skip the
/// Core attribute rewrites in between, and the asset's displayed level would
/// then disagree with the PDA that actually prices the discount.
pub fn next_level(current: u8, score: u64) -> Result<u8> {
    require!(current < MAX_PERK_LEVEL, AttentionError::MaxLevelReached);
    let next = current + 1;
    let required = required_for_level(next).ok_or(AttentionError::MaxLevelReached)?;
    require!(score >= required, AttentionError::InsufficientActivity);
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOL: u64 = 1_000_000_000;

    #[test]
    fn the_ladder_matches_the_published_thresholds() {
        assert_eq!(required_for_level(1), Some(SOL));
        assert_eq!(required_for_level(5), Some(250 * SOL));
        assert_eq!(required_for_level(0), None, "level 0 is not a perk");
        assert_eq!(required_for_level(6), None, "there is no level 6");
    }

    #[test]
    fn a_score_earns_the_highest_level_it_clears() {
        assert_eq!(level_for_score(0), 0);
        assert_eq!(
            level_for_score(SOL - 1),
            0,
            "one lamport short earns nothing"
        );
        assert_eq!(level_for_score(SOL), 1, "exactly the threshold counts");
        assert_eq!(level_for_score(4 * SOL), 1);
        assert_eq!(level_for_score(20 * SOL), 3);
        assert_eq!(level_for_score(249 * SOL), 4);
        assert_eq!(level_for_score(250 * SOL), 5);
    }

    #[test]
    fn the_ladder_stops_at_the_ceiling() {
        // No amount of trading produces a level the discount table can't price.
        assert_eq!(level_for_score(u64::MAX), MAX_PERK_LEVEL);
    }

    #[test]
    fn claiming_needs_the_first_rung() {
        assert!(level_for_claim(0).is_err());
        assert!(level_for_claim(SOL - 1).is_err());
        assert_eq!(level_for_claim(SOL).unwrap(), 1);
        // A trader who crossed several thresholds before claiming gets what
        // they earned, not level 1 and four more transactions.
        assert_eq!(level_for_claim(75 * SOL).unwrap(), 4);
    }

    #[test]
    fn levelling_moves_one_rung_at_a_time() {
        // 250 SOL earns level 5, but from level 1 the next step is still 2 —
        // the Core asset's attributes are rewritten on each step.
        assert_eq!(next_level(1, 250 * SOL).unwrap(), 2);
        assert_eq!(next_level(4, 250 * SOL).unwrap(), 5);
    }

    #[test]
    fn levelling_requires_the_activity_for_the_rung_being_claimed() {
        // Holding level 1 with 4 SOL of volume: level 2 needs 5.
        assert!(next_level(1, 4 * SOL).is_err());
        assert!(next_level(1, 5 * SOL).is_ok());
        // And the ceiling holds.
        assert!(next_level(MAX_PERK_LEVEL, u64::MAX).is_err());
    }

    #[test]
    fn every_rung_is_reachable_by_trading_alone() {
        // The property that matters for making this permissionless: from level
        // 0, a wallet with enough activity can climb to the top with no
        // signature but its own.
        let mut level = level_for_claim(u64::MAX).unwrap();
        assert_eq!(level, MAX_PERK_LEVEL);

        level = level_for_claim(SOL).unwrap();
        let mut steps = 0;
        while level < MAX_PERK_LEVEL {
            level = next_level(level, u64::MAX).unwrap();
            steps += 1;
            assert!(steps <= MAX_PERK_LEVEL, "climbing must terminate");
        }
        assert_eq!(level, MAX_PERK_LEVEL);
    }
}
