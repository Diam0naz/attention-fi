use anchor_lang::prelude::*;

// ---- PDA seeds ----
pub const GLOBAL_SEED: &[u8] = b"global";
/// Singleton PDA holding the NFT market's fee schedule.
///
/// Separate from `Global` rather than two more fields on it. `Global` is live
/// on-chain and Anchor sizes an account exactly, so lengthening the struct
/// leaves every existing `Global` too short to deserialize — the config that
/// gates every instruction in the program would stop loading, and the
/// instruction meant to repair it could not read it either. The same reasoning
/// gave `Promotion` and `MindshareState` their own accounts.
pub const FEECONFIG_SEED: &[u8] = b"feeconfig";
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
/// A token's fixed-price run of genesis fee-share NFTs, keyed by subject mint.
pub const GENGROUP_SEED: &[u8] = b"gengroup";
/// One wallet's holdings from one token's group — the per-wallet cap is
/// enforced by this PDA existing and counting, so the limit survives the buyer
/// using a fresh transaction, a different RPC or a different session.
pub const GENALLOC_SEED: &[u8] = b"genalloc";
pub const NFTAUCTION_SEED: &[u8] = b"nftauction";
/// Escrow for a whole collection on sale. Separate from `NFTAUCTION_SEED`
/// because a collection is a different Core account type that changes hands a
/// different way — see `list_collection_auction`.
pub const COLLECTIONAUCTION_SEED: &[u8] = b"colauction";
/// Paid placement for a listing, keyed by the asset or collection promoted.
pub const PROMO_SEED: &[u8] = b"promo";

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
/// Fee on an NFT or collection sale, in basis points (2.5% = 250).
///
/// Deliberately not the curve's fee. The two price different things: a trading
/// fee is charged over and over on the same capital as it moves along a curve,
/// so it has to be small, while a marketplace fee is charged once when a piece
/// changes hands, and 2.5% is what the NFT market charges. Sharing one number
/// meant every retune of one silently repriced the other.
pub const DEFAULT_NFT_FEE_BPS: u16 = 250;
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

/// Cost of one day of promoted placement, in lamports.
///
/// Priced to be an easy yes for someone who wants a listing seen and a poor
/// deal for anyone trying to bury the feed under their own inventory. It is
/// charged per day bought, never per day held: an unpromoted listing costs
/// nothing and stays up forever, so nobody loses an NFT for failing to top up.
pub const PROMO_LAMPORTS_PER_DAY: u64 = LAMPORTS_PER_SOL / 100;

/// Longest promotion that can be bought in a single call.
///
/// Not a cap on total promotion — calls stack — but a bound on how much can be
/// spent by one fat-fingered number.
pub const MAX_PROMO_DAYS: u16 = 90;

/// Most guardians the emergency pause will hold.
///
/// Fixed rather than a `Vec` so `Guardians` has one length forever: the account
/// is read by every gated instruction on the hot path, and a growable set would
/// mean its size — and therefore its rent and its deserialisation cost —
/// changed under a rotation.
pub const MAX_GUARDIANS: usize = 5;

/// Singleton PDA holding the guardian set and the pause flag.
pub const GUARDIANS_SEED: &[u8] = b"guardians";

/// Timestamps kept per wallet for the launch rate limit.
///
/// The ring must be at least the largest cap the policy may set, or the window
/// could hold more launches than it can remember and the limit would leak.
/// `validate_launch_policy` enforces that relationship rather than leaving it
/// to whoever edits these numbers next.
pub const MAX_LAUNCH_SLOTS: usize = 8;

/// Singleton PDA holding the tunable launch policy.
pub const LAUNCHPOLICY_SEED: &[u8] = b"launchpolicy";

/// Per-wallet PDA holding recent launch timestamps.
pub const LAUNCHQUOTA_SEED: &[u8] = b"launchquota";
