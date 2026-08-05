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
pub const MINDSHARE_SEED: &[u8] = b"mindshare";
pub const TRADER_SEED: &[u8] = b"trader";
pub const PERK_SEED: &[u8] = b"perk";
pub const PERK_AUTH_SEED: &[u8] = b"perkauth";
pub const PERKGRANT_SEED: &[u8] = b"perkgrant";
pub const GENESIS_SEED: &[u8] = b"genesis";
pub const GENPOOL_SEED: &[u8] = b"genpool";
pub const NFTAUCTION_SEED: &[u8] = b"nftauction";

/// One SOL in lamports, so tiers below can be written in the unit their doc
/// comments describe them in.
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

// ---- Perk NFTs ----
/// Highest perk level reachable.
pub const MAX_PERK_LEVEL: u8 = 5;
/// Fee discount granted per perk level, as basis points **of the trading fee**
/// — 1000 = 10% off the fee per level, so level 5 halves it.
///
/// Deliberately a share of the fee rather than a flat subtraction from it. The
/// flat version was 100 bps/level against a 100 bps fee, so level 1 waived the
/// entire fee and levels 2-5 changed nothing: every perk was identical, and a
/// perk holder's trades paid the creator and the treasury zero. A proportional
/// discount can't do that no matter how the fee is later retuned.
pub const DISCOUNT_PER_LEVEL_BPS: u16 = 1000;
/// Cumulative activity score (TraderStats::activity_score, lamports) required
/// to reach each level. Index 0 = level 1's requirement, etc.
pub const PERK_LEVEL_ACTIVITY_LAMPORTS: [u64; MAX_PERK_LEVEL as usize] = [
    LAMPORTS_PER_SOL,       // level 1: 1 SOL
    5 * LAMPORTS_PER_SOL,   // level 2: 5 SOL
    20 * LAMPORTS_PER_SOL,  // level 3: 20 SOL
    75 * LAMPORTS_PER_SOL,  // level 4: 75 SOL
    250 * LAMPORTS_PER_SOL, // level 5: 250 SOL
];

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
pub const DEFAULT_GRADUATION_SOL: u64 = 85 * LAMPORTS_PER_SOL;

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
