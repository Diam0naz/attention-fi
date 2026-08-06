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
