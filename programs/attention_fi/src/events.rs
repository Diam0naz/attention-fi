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
