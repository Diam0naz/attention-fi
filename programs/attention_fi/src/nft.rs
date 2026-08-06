//! Shared helpers for the Metaplex Core NFT layer.

use crate::constants::{DISCOUNT_PER_LEVEL_BPS, LAMPORTS_PER_SOL, MAX_PERK_LEVEL};
use anchor_lang::prelude::AccountInfo;
use mpl_core::types::{Attribute, Attributes, PluginType};
use mpl_core::{fetch_collection_plugin, fetch_plugins};

/// 100% in basis points.
const BPS_DENOMINATOR: u16 = 10_000;

/// Trading-fee discount (bps) granted by a perk NFT at `level`, capped at the
/// discount for `MAX_PERK_LEVEL`.
pub fn perk_discount_bps(level: u8) -> u16 {
    let capped = if level > MAX_PERK_LEVEL {
        MAX_PERK_LEVEL
    } else {
        level
    };
    u16::from(capped) * DISCOUNT_PER_LEVEL_BPS
}

/// Effective trading fee (bps) after applying a perk holder's discount.
///
/// `discount_bps` is a share **of the fee**, not a flat subtraction from it: at
/// 1000 the holder pays 90% of the going rate, whatever that rate happens to
/// be. The flat version silently zeroed the fee — 100 bps off a 100 bps fee —
/// which made every perk level identical and paid creators nothing on a perk
/// holder's trades.
///
/// Capped at 100% so a discount can never invert the fee, and rounded in the
/// protocol's favour so the waiver can't exceed what was actually charged.
pub fn discounted_fee_bps(base_fee_bps: u16, discount_bps: u16) -> u16 {
    let discount_bps = u32::from(discount_bps.min(BPS_DENOMINATOR));
    let waived = u32::from(base_fee_bps) * discount_bps / u32::from(BPS_DENOMINATOR);
    base_fee_bps.saturating_sub(waived as u16)
}

/// Build the on-chain Attributes for a perk NFT at a given level.
pub fn perk_attributes(level: u8) -> Attributes {
    Attributes {
        attribute_list: vec![
            Attribute {
                key: "kind".to_string(),
                value: "perk".to_string(),
            },
            Attribute {
                key: "level".to_string(),
                value: level.to_string(),
            },
            Attribute {
                key: "discount_bps".to_string(),
                value: perk_discount_bps(level).to_string(),
            },
        ],
    }
}

/// Lamports rendered as SOL with three decimals, for display in an Attribute.
///
/// Integer-only: this runs on-chain, and the exact lamport figure is written
/// alongside it, so this is the convenience half of the pair rather than the
/// authoritative one.
pub fn lamports_to_sol_string(lamports: u64) -> String {
    let whole = lamports / LAMPORTS_PER_SOL;
    let milli = (lamports % LAMPORTS_PER_SOL) / (LAMPORTS_PER_SOL / 1_000);
    format!("{whole}.{milli:03}")
}

/// Attributes recording what an asset last sold for.
///
/// Written by `buy_nft` so the price travels with the NFT itself rather than
/// living only in an event or an indexer — a wallet or marketplace reading the
/// asset sees the last sale without knowing anything about AttentionFi.
///
/// Both forms are stored deliberately: `last_sale_lamports` is exact and is
/// what any program or indexer should read, while `last_sale_sol` exists so a
/// generic trait viewer shows something a person can read.
pub fn last_sale_attributes(price_lamports: u64, timestamp: i64) -> Attributes {
    Attributes {
        attribute_list: vec![
            Attribute {
                key: "last_sale_lamports".to_string(),
                value: price_lamports.to_string(),
            },
            Attribute {
                key: "last_sale_sol".to_string(),
                value: lamports_to_sol_string(price_lamports),
            },
            Attribute {
                key: "last_sale_at".to_string(),
                value: timestamp.to_string(),
            },
        ],
    }
}

/// Current member count of a Core collection, read from its account data.
///
/// `BaseCollectionV1` is borsh: 1-byte key + 32-byte update authority + name +
/// uri + num_minted: u32 + current_size: u32. `num_minted` is cumulative and
/// overcounts after a burn, so the size is the second of the two.
///
/// Returns None when the account is too short or the strings don't parse,
/// which is the caller's signal that this isn't a collection at all.
pub fn collection_size(account_data: &[u8]) -> Option<u32> {
    let mut offset = 1 + 32;
    for _ in 0..2 {
        let len_bytes = account_data.get(offset..offset + 4)?;
        let len = u32::from_le_bytes(len_bytes.try_into().ok()?) as usize;
        offset = offset.checked_add(4)?.checked_add(len)?;
    }
    offset = offset.checked_add(4)?; // num_minted
    let size_bytes = account_data.get(offset..offset + 4)?;
    Some(u32::from_le_bytes(size_bytes.try_into().ok()?))
}

/// Whether a Core *collection* already carries an Attributes plugin.
///
/// Deliberately not [`has_attributes_plugin`]: that reads the registry via
/// mpl-core's `fetch_plugins`, which parses the account as a `BaseAssetV1`.
/// A collection's header is a different size, so pointing the asset version at
/// a collection reads the registry from the wrong offset and answers
/// confidently with nonsense.
pub fn collection_has_attributes(account: &AccountInfo) -> bool {
    fetch_collection_plugin::<Attributes>(account, PluginType::Attributes).is_ok()
}

/// Whether `account_data` already carries an Attributes plugin.
///
/// `AddPluginV1` fails outright when the plugin exists, and an asset can be
/// listed, sold and listed again — so the second listing must update rather
/// than add. Returns false when the registry can't be parsed, which routes the
/// caller to `AddPluginV1` and lets mpl-core reject it authoritatively instead
/// of this guess deciding.
pub fn has_attributes_plugin(account_data: &[u8]) -> bool {
    let Ok(records) = fetch_plugins(account_data) else {
        return false;
    };
    for record in records {
        if record.plugin_type == PluginType::Attributes {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sol_string_renders_three_decimals() {
        assert_eq!(lamports_to_sol_string(0), "0.000");
        assert_eq!(lamports_to_sol_string(LAMPORTS_PER_SOL), "1.000");
        assert_eq!(lamports_to_sol_string(1_250_000_000), "1.250");
        // Truncates below a milli-SOL rather than rounding up, so the string
        // never claims a higher price than was paid.
        assert_eq!(lamports_to_sol_string(1_999_999), "0.001");
        assert_eq!(lamports_to_sol_string(999_999), "0.000");
    }

    /// Build a `BaseCollectionV1` body: key + authority + name + uri +
    /// num_minted + current_size.
    fn collection_bytes(name: &str, uri: &str, num_minted: u32, size: u32) -> Vec<u8> {
        let mut data = vec![5u8];
        data.extend_from_slice(&[0u8; 32]);
        for field in [name, uri] {
            data.extend_from_slice(&(field.len() as u32).to_le_bytes());
            data.extend_from_slice(field.as_bytes());
        }
        data.extend_from_slice(&num_minted.to_le_bytes());
        data.extend_from_slice(&size.to_le_bytes());
        data
    }

    #[test]
    fn collection_size_reads_current_not_cumulative() {
        // num_minted counts every mint ever; current_size is what's left after
        // burns. Listing must advertise the latter.
        let data = collection_bytes("Deck", "https://x/y", 9, 4);
        assert_eq!(collection_size(&data), Some(4));
    }

    #[test]
    fn collection_size_handles_empty_strings() {
        assert_eq!(collection_size(&collection_bytes("", "", 0, 0)), Some(0));
    }

    #[test]
    fn collection_size_rejects_truncated_accounts() {
        let data = collection_bytes("Deck", "https://x/y", 9, 4);
        assert_eq!(collection_size(&data[..data.len() - 1]), None);
        assert_eq!(collection_size(&[]), None);
        // An asset account, not a collection: the layout diverges immediately.
        assert_eq!(collection_size(&[1u8; 20]), None);
    }

    #[test]
    fn last_sale_records_exact_lamports_beside_the_readable_form() {
        let attrs = last_sale_attributes(1_250_000_000, 42);
        let exact = &attrs.attribute_list[0];
        assert_eq!(exact.key, "last_sale_lamports");
        assert_eq!(exact.value, "1250000000");
        assert_eq!(attrs.attribute_list[1].value, "1.250");
        assert_eq!(attrs.attribute_list[2].value, "42");
    }

    #[test]
    fn discount_is_a_share_of_the_fee() {
        // 10% off a 1% fee leaves 0.9%.
        assert_eq!(discounted_fee_bps(100, 1_000), 90);
        // Half off leaves half.
        assert_eq!(discounted_fee_bps(100, 5_000), 50);
        // The whole fee waived only at a full 100%.
        assert_eq!(discounted_fee_bps(100, 10_000), 0);
    }

    #[test]
    fn discount_never_inverts_or_overflows_the_fee() {
        assert_eq!(
            discounted_fee_bps(100, 25_000),
            0,
            "a discount past 100% is capped, not wrapped"
        );
        // The intermediate product would overflow u16; it must not.
        assert_eq!(discounted_fee_bps(u16::MAX, 10_000), 0);
        assert_eq!(discounted_fee_bps(u16::MAX, 0), u16::MAX);
    }

    #[test]
    fn max_level_never_waives_the_whole_fee() {
        // The bug this replaced: every level zeroed a 100 bps fee, so creators
        // and the treasury earned nothing on a perk holder's trades.
        let fee = discounted_fee_bps(100, perk_discount_bps(MAX_PERK_LEVEL));
        assert!(fee > 0, "top-level perk still pays a fee, got {fee}");
        assert_eq!(fee, 50, "level 5 halves a 1% fee");
    }

    #[test]
    fn each_level_is_strictly_better_than_the_last() {
        let mut previous = discounted_fee_bps(100, perk_discount_bps(0));
        for level in 1..=MAX_PERK_LEVEL {
            let fee = discounted_fee_bps(100, perk_discount_bps(level));
            assert!(
                fee < previous,
                "level {level} must beat level {}: {fee} vs {previous}",
                level - 1
            );
            previous = fee;
        }
    }

    #[test]
    fn discount_scales_with_level_and_caps() {
        assert_eq!(perk_discount_bps(0), 0);
        assert_eq!(perk_discount_bps(1), DISCOUNT_PER_LEVEL_BPS);
        assert_eq!(perk_discount_bps(3), 3 * DISCOUNT_PER_LEVEL_BPS);
        // Capped at MAX_PERK_LEVEL.
        assert_eq!(
            perk_discount_bps(MAX_PERK_LEVEL),
            u16::from(MAX_PERK_LEVEL) * DISCOUNT_PER_LEVEL_BPS
        );
        assert_eq!(
            perk_discount_bps(MAX_PERK_LEVEL + 10),
            perk_discount_bps(MAX_PERK_LEVEL)
        );
    }
}
