use anchor_lang::prelude::*;

// ---- PDA seeds ----
pub const GLOBAL_SEED: &[u8] = b"global";
pub const CURVE_SEED: &[u8] = b"curve";
pub const AMM_SEED: &[u8] = b"amm";
pub const AUCTION_SEED: &[u8] = b"auction";
pub const CONVICTION_SEED: &[u8] = b"conviction";
pub const POSITION_SEED: &[u8] = b"position";
pub const REVENUE_SEED: &[u8] = b"revenue";
pub const REVSTAKE_SEED: &[u8] = b"revstake";
pub const VERIFY_SEED: &[u8] = b"verify";
pub const ISSUER_SEED: &[u8] = b"issuer";
pub const PERK_SEED: &[u8] = b"perk";
pub const PERK_AUTH_SEED: &[u8] = b"perkauth";
pub const GENESIS_SEED: &[u8] = b"genesis";
pub const GENPOOL_SEED: &[u8] = b"genpool";
pub const NFTAUCTION_SEED: &[u8] = b"nftauction";

// ---- Perk NFTs ----
/// Highest perk level reachable.
pub const MAX_PERK_LEVEL: u8 = 5;
/// Fee discount granted per perk level, in basis points (1% per level).
pub const DISCOUNT_PER_LEVEL_BPS: u16 = 100;

// Exposed in the IDL for clients that derive PDAs from the seed string.
#[constant]
pub const GLOBAL_SEED_STR: &str = "global";
#[constant]
pub const CURVE_SEED_STR: &str = "curve";

// ---- Token defaults ----
/// SPL mint decimals for launched tokens.
pub const TOKEN_DECIMALS: u8 = 6;
/// Total minted supply: 1,000,000,000 tokens at 6 decimals.
pub const TOKEN_TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000;
/// Virtual token reserves offset (Pump-style): 1.073B tokens at 6 decimals.
pub const DEFAULT_VIRTUAL_TOKEN_RESERVES: u64 = 1_073_000_000 * 1_000_000;

// ---- Economics ----
/// Trading fee on the curve, in basis points (1% = 100).
pub const DEFAULT_FEE_BPS: u16 = 100;
/// Share of each trading fee routed to the (verified) creator, in bps of the fee.
/// 5000 = 50% of a 1% fee => 0.5% to creator, 0.5% to protocol (per the brief).
pub const DEFAULT_CREATOR_FEE_SHARE_BPS: u16 = 5000;
/// Graduation trigger: real SOL raised into the curve (85 SOL).
pub const DEFAULT_GRADUATION_SOL: u64 = 85 * 1_000_000_000;

// ---- Conviction curve ----
/// Default loyalty lock: 7 days in seconds.
pub const DEFAULT_LOCK_PERIOD: i64 = 7 * 24 * 60 * 60;
/// Default early-exit penalty for selling a still-locked position (10%).
pub const DEFAULT_EARLY_EXIT_PENALTY_BPS: u16 = 1_000;

// ---- Switchboard mindshare oracle ----
/// Max age (slots) of a feed sample accepted when seeding a launch (~100s).
pub const FEED_MAX_STALENESS: u64 = 250;
/// Minimum oracle samples required for a usable feed value.
pub const FEED_MIN_SAMPLES: u32 = 1;

// ---- Mindshare tier seeds ----
// Starting `virtual_sol_reserves` per tier (lamports). With a fixed virtual
// token supply, the starting price ~= virtual_sol / virtual_token, so the seed
// market cap scales with these values. Figures approximate the strategy brief's
// tiers assuming ~$150/SOL (~$69 / ~$800 / ~$4K / ~$15K).
pub const SEED_NEW_ENTRANT: u64 = 500_000_000; // ~0.5 SOL
pub const SEED_EMERGING: u64 = 5_330_000_000; // ~5.33 SOL
pub const SEED_TOP_100: u64 = 26_700_000_000; // ~26.7 SOL
pub const SEED_TOP_10: u64 = 100_000_000_000; // ~100 SOL
