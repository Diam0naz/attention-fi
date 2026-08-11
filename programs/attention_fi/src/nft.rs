//! Shared helpers for the Metaplex Core NFT layer.

use crate::constants::{DISCOUNT_PER_LEVEL_BPS, LAMPORTS_PER_SOL, MAX_PERK_LEVEL};
use anchor_lang::prelude::*;
use mpl_core::instructions::{CreateV2CpiBuilder, TransferV1CpiBuilder};
use mpl_core::types::{
    Attribute, Attributes, DataState, PermanentFreezeDelegate, Plugin, PluginAuthorityPair,
    PluginType,
};
use mpl_core::{fetch_collection_plugin, fetch_plugins};

/// Mint one perk asset at `level`, owned by `owner` and paid for by them.
///
/// Shared by both claim routes — the granted one and the earned one. They mint
/// the same thing, and a perk whose plugin set depended on how it was obtained
/// would be a perk that behaves differently depending on its provenance.
///
/// Frozen on creation so the discount can't be sold to a higher-volume wallet,
/// with Attributes owned by the program's PDA so the holder can't rewrite their
/// own level. Both properties are what make the discount safe to price off.
pub fn mint_perk_asset<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    perk_authority: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    level: u8,
    uri: String,
) -> Result<()> {
    let plugins = vec![
        PluginAuthorityPair {
            plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
            authority: None,
        },
        PluginAuthorityPair {
            plugin: Plugin::Attributes(perk_attributes(level)),
            authority: None,
        },
    ];

    CreateV2CpiBuilder::new(mpl_core_program)
        .asset(asset)
        .payer(owner)
        .owner(Some(owner))
        .update_authority(Some(perk_authority))
        .system_program(system_program)
        .data_state(DataState::AccountState)
        .name("AttentionFi Perk".to_string())
        .uri(uri)
        .plugins(plugins)
        .invoke()?;
    Ok(())
}

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

/// Whether `account_data` is a Core asset whose update authority is `collection`.
///
/// `BaseAssetV1` is key(1) + owner(32) + UpdateAuthority, and that enum is a
/// tag byte followed by a pubkey for both of its populated variants. Tag 2 is
/// `Collection`, which is the only one that makes an asset a member — tag 1 is
/// `Address`, a standalone asset that merely happens to be pointed somewhere.
pub fn is_member_of(account_data: &[u8], collection: &Pubkey) -> bool {
    const KEY_ASSET_V1: u8 = 1;
    const AUTHORITY_COLLECTION: u8 = 2;
    if account_data.first() != Some(&KEY_ASSET_V1) {
        return false;
    }
    if account_data.get(33) != Some(&AUTHORITY_COLLECTION) {
        return false;
    }
    match account_data.get(34..66) {
        Some(bytes) => Pubkey::try_from(bytes).is_ok_and(|key| key == *collection),
        None => false,
    }
}

/// Move every member of a collection to `new_owner`.
///
/// This is what makes selling a collection mean anything. A Core collection
/// has only an update authority, so reassigning it hands over the right to
/// change the collection and its members' metadata — but each member is a
/// separate account with its own `owner`, and that field is untouched by any
/// amount of authority juggling. Without this, a buyer paid for a deck whose
/// cards stayed in the seller's wallet, free to be sold again individually.
///
/// **All or nothing.** `members` must be exactly the collection's live set:
/// the count is checked against `current_size` and each account is checked to
/// be a member of this collection specifically. A partial escrow would be the
/// worst of both worlds — a listing that looks whole and delivers some of it.
/// The practical ceiling is the transaction, which bounds how large a deck can
/// be listed; refusing loudly at that edge is better than selling a fraction.
///
/// Duplicates need no separate check: the second transfer of the same asset
/// finds `authority` is no longer its owner, and mpl-core rejects it.
#[allow(clippy::too_many_arguments)]
pub fn move_collection_members<'info>(
    members: &[AccountInfo<'info>],
    collection: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    new_owner: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    core_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let expected = collection_size(&collection.try_borrow_data()?)
        .ok_or(crate::error::AttentionError::InvalidAuctionParams)?;
    require!(
        members.len() == expected as usize,
        crate::error::AttentionError::CollectionMembersMismatch
    );

    let collection_key = collection.key();
    for member in members {
        require!(
            is_member_of(&member.try_borrow_data()?, &collection_key),
            crate::error::AttentionError::CollectionMembersMismatch
        );

        let mut transfer = TransferV1CpiBuilder::new(core_program);
        transfer
            .asset(member)
            .collection(Some(collection))
            .payer(payer)
            .authority(Some(authority))
            .new_owner(new_owner)
            .system_program(Some(system_program));
        match signer_seeds {
            Some(seeds) => transfer.invoke_signed(seeds)?,
            None => transfer.invoke()?,
        };
    }
    Ok(())
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

    /// Build a `BaseAssetV1` header: key + owner + UpdateAuthority(tag, pubkey).
    fn asset_bytes(key: u8, tag: u8, authority: &Pubkey) -> Vec<u8> {
        let mut data = vec![key];
        data.extend_from_slice(&[7u8; 32]); // owner, deliberately not the authority
        data.push(tag);
        data.extend_from_slice(authority.as_ref());
        data
    }

    #[test]
    fn a_collection_member_is_recognised() {
        let collection = Pubkey::new_unique();
        assert!(is_member_of(&asset_bytes(1, 2, &collection), &collection));
    }

    #[test]
    fn membership_is_specific_to_one_collection() {
        let collection = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        // The check that stops a seller escrowing eight assets from a deck
        // nobody bought and passing the count test with them.
        assert!(!is_member_of(&asset_bytes(1, 2, &other), &collection));
    }

    #[test]
    fn a_standalone_asset_is_not_a_member() {
        let collection = Pubkey::new_unique();
        // Tag 1 is UpdateAuthority::Address — an asset pointed at an address
        // that merely happens to be a collection's. Accepting it would let an
        // unrelated asset be counted toward the deck.
        assert!(!is_member_of(&asset_bytes(1, 1, &collection), &collection));
        // Tag 0 is None, with no pubkey following at all.
        assert!(!is_member_of(&[1u8; 34], &collection));
    }

    #[test]
    fn a_collection_account_is_not_its_own_member() {
        let collection = Pubkey::new_unique();
        // Key 5 is BaseCollectionV1. Passing the collection itself among the
        // members would otherwise read its authority bytes as an asset's.
        assert!(!is_member_of(&asset_bytes(5, 2, &collection), &collection));
    }

    #[test]
    fn truncated_data_is_not_a_member() {
        let collection = Pubkey::new_unique();
        let full = asset_bytes(1, 2, &collection);
        // One byte short of a full authority pubkey: must refuse rather than
        // read past the end or match on a prefix.
        assert!(!is_member_of(&full[..full.len() - 1], &collection));
        assert!(!is_member_of(&[], &collection));
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
