//! On-chain events for off-chain indexing (Helius geyser) and the live feed.

use anchor_lang::prelude::*;

// Launch mechanism discriminants carried in `LaunchEvent`.
pub const MECH_BONDING: u8 = 0;
pub const MECH_DUTCH: u8 = 1;
pub const MECH_CONVICTION: u8 = 2;
pub const MECH_REVENUE: u8 = 3;

/// Emitted when a new token is launched under any mechanism.
#[event]
pub struct LaunchEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    /// One of the `MECH_*` discriminants.
    pub mechanism: u8,
    pub tier: u8,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub timestamp: i64,
}

/// Emitted on every curve trade (buy or sell).
#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub is_buy: bool,
    /// Gross SOL spent (buy) or net SOL received (sell), in lamports.
    pub sol_amount: u64,
    /// Tokens received (buy) or returned (sell), in base units.
    pub token_amount: u64,
    pub fee: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub timestamp: i64,
}

/// Emitted once, when a curve crosses the graduation threshold.
#[event]
pub struct GraduateEvent {
    pub mint: Pubkey,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub timestamp: i64,
}

/// Emitted when a verified creator claims accrued creator fees.
#[event]
pub struct CreatorClaimEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Emitted when a graduated curve's liquidity migrates into a native AMM pool.
#[event]
pub struct PoolCreatedEvent {
    pub mint: Pubkey,
    pub sol_reserves: u64,
    pub token_reserves: u64,
    pub timestamp: i64,
}

/// Emitted on every AMM swap.
#[event]
pub struct AmmSwapEvent {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub is_buy: bool,
    pub amount_in: u64,
    pub amount_out: u64,
    pub sol_reserves: u64,
    pub token_reserves: u64,
    pub timestamp: i64,
}

// How a 1-of-1 listing ended, carried in `NftAuctionEvent`.
pub const NFT_SOLD: u8 = 0;
pub const NFT_RECLAIMED: u8 = 1;

/// Emitted when a 1-of-1 auction ends — sold to a buyer, or returned unsold.
///
/// `NftAuction.complete` is set by both paths, so account state alone can't
/// distinguish them after the fact; without this, an indexer had nothing to
/// read and a lister got no notice that their asset had sold.
#[event]
pub struct NftAuctionEvent {
    pub asset: Pubkey,
    pub creator: Pubkey,
    /// The buyer on a sale; equal to `creator` on a reclaim.
    pub counterparty: Pubkey,
    /// One of the `NFT_*` discriminants.
    pub outcome: u8,
    /// Descending price actually paid, in lamports. Zero on a reclaim.
    pub price: u64,
    /// Protocol fee charged on top of `price`. Zero on a reclaim.
    pub fee: u64,
    pub timestamp: i64,
}

/// Emitted when a listing buys promoted placement.
#[event]
pub struct ListingPromotedEvent {
    pub subject: Pubkey,
    pub payer: Pubkey,
    pub days: u16,
    pub lamports: u64,
    /// Where the promotion now runs to, after stacking onto any remainder.
    pub promoted_until: i64,
    pub timestamp: i64,
}

/// Emitted when a collection is listed for sale.
///
/// Separate from `NftListedEvent` rather than reusing it with the collection
/// in the `asset` field: a feed that can't tell the two apart renders a whole
/// collection as though it were a single piece.
#[event]
pub struct CollectionListedEvent {
    pub collection: Pubkey,
    pub creator: Pubkey,
    /// Members at listing time — what the buyer is being offered.
    pub size: u32,
    pub start_price: u64,
    pub floor_price: u64,
    pub duration: i64,
    pub timestamp: i64,
}

/// Emitted when a collection listing ends — sold, or returned unsold.
#[event]
pub struct CollectionAuctionEvent {
    pub collection: Pubkey,
    pub creator: Pubkey,
    /// The buyer on a sale; equal to `creator` on a reclaim.
    pub counterparty: Pubkey,
    /// One of the `NFT_*` discriminants, shared with `NftAuctionEvent`.
    pub outcome: u8,
    /// Descending price actually paid, in lamports. Zero on a reclaim.
    pub price: u64,
    /// Protocol fee charged on top of `price`. Zero on a reclaim.
    pub fee: u64,
    pub timestamp: i64,
}

/// Emitted when a 1-of-1 is listed, whether freshly minted or already owned.
#[event]
pub struct NftListedEvent {
    pub asset: Pubkey,
    pub creator: Pubkey,
    pub start_price: u64,
    pub floor_price: u64,
    pub duration: i64,
    pub timestamp: i64,
}

/// Emitted when a token opens a fixed-price run of genesis fee-share NFTs.
#[event]
pub struct GenesisGroupListedEvent {
    pub subject_mint: Pubkey,
    pub creator: Pubkey,
    pub collection: Pubkey,
    /// Units the run will ever contain — the denominator a buyer's share is
    /// judged against, and the number the escrowed collection authority makes
    /// binding.
    pub total_units: u16,
    pub share_bps: u16,
    pub price: u64,
    pub per_wallet_cap: u16,
    pub timestamp: i64,
}

/// Emitted when units are minted into a group's collection.
#[event]
pub struct GenesisBatchMintedEvent {
    pub subject_mint: Pubkey,
    pub collection: Pubkey,
    /// Units created by this call.
    pub units: u16,
    /// Running total minted, out of `total_units`.
    pub minted_units: u16,
    pub timestamp: i64,
}

/// Emitted when a creator takes unsold units back out of a group's escrow.
#[event]
pub struct GenesisUnitsReclaimedEvent {
    pub subject_mint: Pubkey,
    pub creator: Pubkey,
    /// Units returned by this call.
    pub units: u16,
    /// Units the group still holds, sold and unsold together.
    pub minted_units: u16,
    pub timestamp: i64,
}

/// Emitted when a group is delisted and its collection handed back.
#[event]
pub struct GenesisGroupClosedEvent {
    pub subject_mint: Pubkey,
    pub creator: Pubkey,
    pub collection: Pubkey,
    /// Units that found a buyer before it closed; they keep earning.
    pub sold_units: u16,
    pub timestamp: i64,
}

/// Emitted when a buyer takes one unit out of a group.
#[event]
pub struct GenesisUnitSoldEvent {
    pub subject_mint: Pubkey,
    pub asset: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    /// Protocol fee charged on top of `price`.
    pub fee: u64,
    pub share_bps: u16,
    /// Units sold from the group after this sale.
    pub sold_units: u16,
    pub timestamp: i64,
}

/// Emitted when the protocol's trading economics are retuned.
///
/// Every field is the value in force *after* the call, supplied or not, so an
/// indexer reading one event knows the whole configuration rather than a diff
/// it has to replay from genesis to interpret.
#[event]
pub struct ConfigUpdatedEvent {
    pub authority: Pubkey,
    pub fee_bps: u16,
    pub creator_fee_share_bps: u16,
    pub graduation_sol: u64,
    pub virtual_token_reserves: u64,
    pub timestamp: i64,
}

/// Emitted when the NFT market's fee schedule changes.
#[event]
pub struct FeeConfigUpdatedEvent {
    pub authority: Pubkey,
    pub nft_fee_bps: u16,
    pub promo_lamports_per_day: u64,
    pub timestamp: i64,
}

/// Emitted when protocol authority moves to a different wallet.
///
/// Authority gates every privileged instruction, so a handover is the single
/// most consequential administrative act — worth an indexable record rather
/// than only a silent field change.
#[event]
pub struct AuthorityChangedEvent {
    pub previous: Pubkey,
    pub current: Pubkey,
    pub timestamp: i64,
}

/// Emitted whenever the emergency stop changes hands, in either direction.
///
/// Carries the tally as well as the state because a resume is a sequence, not
/// an instant: watchers need to see "2 of 3 so far" while it is happening, not
/// only the moment it completes.
#[event]
pub struct PauseEvent {
    /// The guardian whose signature caused this.
    pub guardian: Pubkey,
    /// State *after* this call.
    pub paused: bool,
    /// Resume approvals standing after this call.
    pub approvals: u8,
    pub threshold: u8,
    pub timestamp: i64,
}

/// Emitted when a token is disowned or restored.
///
/// Carries the direction as a flag rather than being two events, so an indexer
/// watching a mint sees one ordered stream and cannot render a restore it
/// missed the flag for.
#[event]
pub struct DisavowEvent {
    pub mint: Pubkey,
    pub disavowed_by: Pubkey,
    pub reason: crate::state::DisavowReason,
    /// State *after* this call.
    pub disavowed: bool,
    pub timestamp: i64,
}

/// The authority switched product features on or off for new entries.
#[event]
pub struct FeatureGateEvent {
    pub authority: Pubkey,
    /// Bitmask of disabled features *after* this call (`features::FEATURE_*`).
    pub disabled: u32,
    pub timestamp: i64,
}
