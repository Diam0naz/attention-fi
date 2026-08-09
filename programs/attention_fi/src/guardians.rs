//! The emergency stop, and who is allowed to pull it.
//!
//! The pre-launch checklist calls this out as CRITICAL, citing Pump's May 2024
//! exploit — a former employee who kept migration access. The lesson isn't
//! "have a pause", it's "don't let one key be the whole story". So the two
//! directions are deliberately asymmetric:
//!
//! **Pausing takes one guardian.** An exploit in progress is measured in
//! blocks. A stop that first has to collect three signatures is a stop that
//! arrives after the money. The worst a single bad guardian can do is halt
//! trading, which is recoverable and visible.
//!
//! **Resuming takes a threshold.** That is the direction where a single
//! compromised key would be catastrophic: unpausing mid-exploit hands the
//! attacker back the drain. So resuming is the slow, deliberate, several-people
//! path — exactly what the checklist means by 2/3 or 3/5.
//!
//! What the pause covers is a separate judgement, made at the call sites: it
//! stops trades, migrations and market purchases, and deliberately does *not*
//! stop claims or reclaims. A pause exists to stop new risk, not to trap money
//! the ledger already says is owed — freezing withdrawals turns an incident
//! into a run, and every claim path here pays out a recorded balance rather
//! than anything the curve computes fresh.
//!
//! All functions are pure so the quorum arithmetic is unit-tested off-chain.

use crate::constants::MAX_GUARDIANS;
use crate::error::AttentionError;
use crate::state::Guardians;
use anchor_lang::prelude::*;

/// Check a proposed guardian set before it is written.
///
/// Rejects duplicates specifically because a duplicated key would otherwise
/// count twice toward a resume — one person holding two slots in a "3 of 5"
/// quietly makes it a 2-of-4, which is the whole property this is meant to
/// provide.
pub fn validate_set(members: &[Pubkey], threshold: u8) -> Result<()> {
    require!(
        !members.is_empty() && members.len() <= MAX_GUARDIANS,
        AttentionError::InvalidGuardianSet
    );
    require!(
        threshold >= 1 && usize::from(threshold) <= members.len(),
        AttentionError::InvalidGuardianSet
    );
    for (i, m) in members.iter().enumerate() {
        require!(*m != Pubkey::default(), AttentionError::InvalidGuardianSet);
        for other in &members[i + 1..] {
            require!(m != other, AttentionError::InvalidGuardianSet);
        }
    }
    Ok(())
}

/// Whether `key` holds one of the first `count` guardian slots.
pub fn is_member(members: &[Pubkey; MAX_GUARDIANS], count: u8, key: &Pubkey) -> bool {
    members.iter().take(usize::from(count)).any(|m| m == key)
}

/// Record one guardian's approval to resume, returning the new tally.
///
/// Approving twice is a no-op rather than an error: a guardian who resends
/// after a dropped transaction should not be told they did something wrong,
/// and it must never advance the count.
pub fn record_approval(
    approvals: &mut [Pubkey; MAX_GUARDIANS],
    approval_count: u8,
    key: Pubkey,
) -> Result<u8> {
    let n = usize::from(approval_count);
    if approvals.iter().take(n).any(|a| *a == key) {
        return Ok(approval_count);
    }
    require!(n < MAX_GUARDIANS, AttentionError::InvalidGuardianSet);
    approvals[n] = key;
    Ok(approval_count + 1)
}

/// Refuse to proceed while the protocol is paused.
///
/// An empty account means no guardian set has been configured yet, which reads
/// as "not paused" rather than as an error. That keeps a deploy from bricking
/// every gated instruction in the window before `set_guardians` runs — the same
/// shape as `revenue::genesis_share_bps`, and safe for the same reason: the
/// address is pinned by seeds, so emptiness is a fact about the chain and not
/// something a caller can assert.
pub fn require_live(info: &AccountInfo) -> Result<()> {
    if info.data_is_empty() {
        return Ok(());
    }
    require_keys_eq!(*info.owner, crate::ID, AttentionError::Unauthorized);
    let data = info.try_borrow_data()?;
    let guardians = Guardians::try_deserialize(&mut &data[..])?;
    require!(!guardians.paused, AttentionError::ProtocolPaused);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(n: usize) -> Vec<Pubkey> {
        (0..n).map(|_| Pubkey::new_unique()).collect()
    }

    fn slots(members: &[Pubkey]) -> [Pubkey; MAX_GUARDIANS] {
        let mut out = [Pubkey::default(); MAX_GUARDIANS];
        out[..members.len()].copy_from_slice(members);
        out
    }

    #[test]
    fn a_set_needs_at_least_one_member_and_a_reachable_threshold() {
        let three = keys(3);
        assert!(validate_set(&three, 2).is_ok());
        assert!(validate_set(&three, 3).is_ok());
        assert!(
            validate_set(&three, 4).is_err(),
            "a threshold nobody can reach is a permanent pause"
        );
        assert!(validate_set(&three, 0).is_err(), "zero would resume itself");
        assert!(validate_set(&[], 1).is_err());
        assert!(validate_set(&keys(MAX_GUARDIANS + 1), 2).is_err());
    }

    #[test]
    fn a_duplicated_guardian_is_rejected() {
        // The rug this closes: one person in two slots turns a 3-of-5 into a
        // 2-of-4 without the set ever looking different.
        let mut members = keys(3);
        members[2] = members[0];
        assert!(validate_set(&members, 2).is_err());
    }

    #[test]
    fn the_default_key_is_not_a_guardian() {
        // Empty slots are the default key, so accepting it as a member would
        // let an unset slot silently count toward a quorum.
        let mut members = keys(3);
        members[1] = Pubkey::default();
        assert!(validate_set(&members, 2).is_err());
    }

    #[test]
    fn membership_stops_at_the_live_count() {
        let members = keys(5);
        let arr = slots(&members);
        assert!(is_member(&arr, 5, &members[4]));
        // Shrinking the set must actually shrink it: slot 4 still holds a key,
        // and a stale occupant must not keep its powers.
        assert!(!is_member(&arr, 3, &members[4]));
        assert!(!is_member(&arr, 3, &Pubkey::new_unique()));
    }

    #[test]
    fn approvals_accumulate_but_never_double_count() {
        let members = keys(3);
        let mut approvals = [Pubkey::default(); MAX_GUARDIANS];
        let mut count = 0u8;

        count = record_approval(&mut approvals, count, members[0]).unwrap();
        assert_eq!(count, 1);
        // The same guardian resending — after a dropped transaction, say —
        // must not carry the vote on its own.
        count = record_approval(&mut approvals, count, members[0]).unwrap();
        assert_eq!(count, 1, "one guardian is one approval");
        count = record_approval(&mut approvals, count, members[1]).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn approvals_cannot_overflow_the_slots() {
        let mut approvals = [Pubkey::default(); MAX_GUARDIANS];
        let mut count = 0u8;
        for k in keys(MAX_GUARDIANS) {
            count = record_approval(&mut approvals, count, k).unwrap();
        }
        assert_eq!(count as usize, MAX_GUARDIANS);
        assert!(record_approval(&mut approvals, count, Pubkey::new_unique()).is_err());
    }

    #[test]
    fn one_guardian_short_of_the_threshold_cannot_resume() {
        // The property the whole design rests on, stated as a test: a 3-of-5
        // is not a 2-of-5 no matter which two show up.
        let members = keys(5);
        let mut approvals = [Pubkey::default(); MAX_GUARDIANS];
        let mut count = 0u8;
        let threshold = 3u8;
        for k in members.iter().take(2) {
            count = record_approval(&mut approvals, count, *k).unwrap();
        }
        assert!(count < threshold);
        count = record_approval(&mut approvals, count, members[2]).unwrap();
        assert!(count >= threshold);
    }
}
