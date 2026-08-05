use anchor_lang::prelude::*;

use crate::constants::{SEED_EMERGING, SEED_NEW_ENTRANT, SEED_TOP_10, SEED_TOP_100};

/// Protocol-wide configuration, created once at `initialize`.
#[account]
#[derive(InitSpace)]
pub struct Global {
    /// Admin authority (may update config in later phases).
    pub authority: Pubkey,
    /// Destination for trading fees.
    pub treasury: Pubkey,
    /// Curve trading fee in basis points.
    pub fee_bps: u16,
    /// Creator's share of each trading fee, in bps of the fee.
    pub creator_fee_share_bps: u16,
    /// Real SOL raised at which a curve graduates.
    pub graduation_sol: u64,
    /// Default virtual token reserves seeded into new curves.
    pub virtual_token_reserves: u64,
    /// Total supply minted per launched token.
    pub token_total_supply: u64,
    /// SPL mint decimals for launched tokens.
    pub token_decimals: u8,
    /// Number of tokens launched through the program.
    pub tokens_launched: u64,
    pub bump: u8,
}

/// Per-token bonding curve. One PDA per mint, seeded by mindshare tier.
#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    /// Virtual SOL reserves (seeded from the mindshare tier).
    pub virtual_sol_reserves: u64,
    /// Virtual token reserves.
    pub virtual_token_reserves: u64,
    /// Real SOL actually deposited into the curve.
    pub real_sol_reserves: u64,
    /// Real tokens still held in the curve vault.
    pub real_token_reserves: u64,
    /// Total supply minted for this token.
    pub token_total_supply: u64,
    /// Creator fees accrued (lamports held in this account, claimable once verified).
    pub creator_fees: u64,
    /// Mindshare tier this curve was seeded at.
    pub tier: u8,
    /// True once the curve has hit the graduation threshold.
    pub complete: bool,
    pub bump: u8,
}

/// Per-token Dutch auction. One PDA per mint. Price descends linearly from
/// `start_price` to `floor_price` over `duration` seconds; bidders pay the
/// current price, so buying early costs more (fair launch, no front-running edge).
#[account]
#[derive(InitSpace)]
pub struct DutchAuction {
    pub mint: Pubkey,
    pub creator: Pubkey,
    /// Ceiling price, lamports per whole token.
    pub start_price: u64,
    /// Floor price, lamports per whole token.
    pub floor_price: u64,
    /// Auction start (unix seconds).
    pub start_time: i64,
    /// Auction length in seconds.
    pub duration: i64,
    /// Total base units offered for sale.
    pub total_for_sale: u64,
    /// Base units sold so far.
    pub tokens_sold: u64,
    /// Lamports of proceeds collected.
    pub real_sol_reserves: u64,
    /// Mindshare tier this auction was tagged at.
    pub tier: u8,
    /// True once sold out or settled after end.
    pub complete: bool,
    pub bump: u8,
}

/// Per-token conviction curve. Prices identically to the bonding curve
/// (constant-product virtual reserves) but every buy time-locks the holder and
/// early sells forfeit a penalty. One PDA per mint.
#[account]
#[derive(InitSpace)]
pub struct ConvictionCurve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub token_total_supply: u64,
    /// Seconds a position is locked after each buy.
    pub lock_period: i64,
    /// Penalty (bps) applied to proceeds when selling before unlock.
    pub early_exit_penalty_bps: u16,
    pub tier: u8,
    pub complete: bool,
    pub bump: u8,
}

/// A holder's stake in a conviction curve. Seeded per (mint, owner). Each buy
/// re-locks the whole position until `unlock_time`.
#[account]
#[derive(InitSpace)]
pub struct ConvictionPosition {
    pub owner: Pubkey,
    pub mint: Pubkey,
    /// Base units currently held under this position.
    pub amount: u64,
    /// Unix time at which the position unlocks (penalty-free selling).
    pub unlock_time: i64,
    pub bump: u8,
}

/// Per-token revenue-share pool. Shares are sold at a fixed `share_price` and
/// entitle the holder to a pro-rata cut of deposited revenue, tracked with a
/// cumulative `acc_revenue_per_share` accumulator. One PDA per mint.
#[account]
#[derive(InitSpace)]
pub struct RevenueShare {
    pub mint: Pubkey,
    pub creator: Pubkey,
    /// Fixed acquisition price, lamports per whole token.
    pub share_price: u64,
    pub token_total_supply: u64,
    /// Shares sold (== total staked, since buying auto-stakes).
    pub shares_sold: u64,
    /// Total shares currently entitled to revenue.
    pub total_staked: u64,
    /// Cumulative revenue per share, scaled by `revenue::ACC_SCALE`.
    pub acc_revenue_per_share: u128,
    /// Lamports of deposited revenue still available to claim.
    pub revenue_reserves: u64,
    pub tier: u8,
    pub bump: u8,
}

/// A holder's revenue-share stake. Seeded per (mint, owner).
#[account]
#[derive(InitSpace)]
pub struct RevenueStake {
    pub owner: Pubkey,
    pub mint: Pubkey,
    /// Shares held (base units).
    pub staked_amount: u64,
    /// Accumulator snapshot: `accrued(staked, acc)` at last settle.
    pub reward_debt: u128,
    /// Settled-but-unclaimed revenue (banked when stake changes).
    pub unclaimed: u64,
    pub bump: u8,
}

/// On-chain record binding a verified X handle to a wallet and its soulbound
/// credential NFT. One PDA per subject wallet. The authoritative "this handle is
/// really this wallet" state; the Metaplex Core asset is the user-visible badge.
#[account]
#[derive(InitSpace)]
pub struct Verification {
    /// The verified wallet.
    pub subject: Pubkey,
    /// The soulbound Metaplex Core asset minted as the credential.
    pub asset: Pubkey,
    /// The X handle (without leading @).
    #[max_len(32)]
    pub handle: String,
    pub verified_at: i64,
    pub bump: u8,
}

/// The dedicated key authorized to sign SAS attestations for `verify_handle`,
/// separate from `Global.authority` so the attestation issuer (a hot key held
/// by the `/api/verify` service) can rotate without touching the protocol's
/// admin key. Singleton PDA; absent until `set_issuer` is called for the
/// first time, in which case `verify_handle` still trusts `Global.authority`.
#[account]
#[derive(InitSpace)]
pub struct IssuerConfig {
    pub issuer: Pubkey,
    pub bump: u8,
}

/// On-chain snapshot of a token's mindshare, sourced from the Switchboard feed.
/// Keyed by mint (works for any launch mechanism) and kept fresh by an
/// oracle-gated `update_mindshare` crank. Instructions that want to react to
/// attention (dynamic graduation, mindshare-weighted rewards) read this cheaply
/// instead of requiring a fresh oracle read in their own transaction. Separate
/// from the curve accounts so adding it never changes their layout.
#[account]
#[derive(InitSpace)]
pub struct MindshareState {
    pub mint: Pubkey,
    /// Conversation share in basis points (e.g. 3.24% => 324).
    pub mindshare_bps: u64,
    /// Tier derived from `mindshare_bps` at the last update.
    pub tier: u8,
    /// Slot of the last oracle update (freshness for readers).
    pub updated_slot: u64,
    pub bump: u8,
}

/// Cumulative trading activity for one wallet, across every mechanism —
/// what perk level-ups are gated on. One per wallet, created on a trader's
/// first buy/sell/deposit and updated on every one after.
#[account]
#[derive(InitSpace)]
pub struct TraderStats {
    pub owner: Pubkey,
    /// Cumulative SOL moved across buys and sells, all mechanisms (lamports).
    pub volume_lamports: u64,
    /// Cumulative SOL locked via conviction buys or revenue-share purchases —
    /// counted separately from (and in addition to) volume_lamports since
    /// committing capital is a stronger signal than a single trade.
    pub deposits_lamports: u64,
    pub bump: u8,
}

impl TraderStats {
    /// Combined score perk levels are gated on: deposits count double since
    /// locking capital is a stronger signal than a single trade.
    pub fn activity_score(&self) -> Result<u64> {
        let doubled = self
            .deposits_lamports
            .checked_mul(2)
            .ok_or(crate::error::AttentionError::MathOverflow)?;
        self.volume_lamports
            .checked_add(doubled)
            .ok_or_else(|| crate::error::AttentionError::MathOverflow.into())
    }

    /// Initializes owner/bump on first touch, then accrues volume/deposits.
    pub fn accrue(&mut self, owner: Pubkey, bump: u8, volume: u64, deposit: u64) -> Result<()> {
        if self.owner == Pubkey::default() {
            self.owner = owner;
            self.bump = bump;
        }
        self.volume_lamports = self
            .volume_lamports
            .checked_add(volume)
            .ok_or(crate::error::AttentionError::MathOverflow)?;
        self.deposits_lamports = self
            .deposits_lamports
            .checked_add(deposit)
            .ok_or(crate::error::AttentionError::MathOverflow)?;
        Ok(())
    }
}

/// An upgradeable perk NFT record. The Metaplex Core asset's Attributes carry
/// the level/discount for display; this PDA is the on-chain source of truth that
/// trading instructions read to apply the holder's fee discount. One per asset.
#[account]
#[derive(InitSpace)]
pub struct PerkNft {
    /// The Metaplex Core asset backing this perk.
    pub asset: Pubkey,
    /// Wallet the perk was minted to.
    pub owner: Pubkey,
    /// Current level (1..=MAX_PERK_LEVEL).
    pub level: u8,
    /// Trading-fee discount granted, in basis points **of the fee** — 1000 is
    /// 10% off whatever the fee happens to be, not 10 bps off it.
    ///
    /// Cached for display and for the IDL; `level` is the source of truth. The
    /// trading instructions recompute from `level` so a perk minted under older
    /// terms isn't stranded on them.
    pub discount_bps: u16,
    pub bump: u8,
}

/// A pending perk grant, awaiting the recipient to claim it.
///
/// Splits `mint_perk` into authorise-then-claim so the protocol can approve a
/// batch of task completions cheaply while each recipient pays for their own
/// Core asset. The authority still decides who gets one — this account IS the
/// authorisation, and `claim_perk` mints only when it exists.
#[account]
#[derive(InitSpace)]
pub struct PerkGrant {
    /// Wallet allowed to claim; the only account this grant can mint to.
    pub recipient: Pubkey,
    /// Level to mint at (1..=MAX_PERK_LEVEL).
    pub level: u8,
    /// Refund target when the grant is consumed — whoever paid to create it.
    pub granter: Pubkey,
    pub bump: u8,
}

/// A fee-share genesis NFT: a transferable Metaplex Core asset minted to an
/// early participant of a specific token, carrying a `share_bps` claim on that
/// token's fee stream. One PDA per asset. (Claim routing wires up during the
/// fee-distribution pass.)
#[account]
#[derive(InitSpace)]
pub struct GenesisNft {
    /// The Metaplex Core asset backing this genesis share.
    pub asset: Pubkey,
    /// Current owner at mint time.
    pub owner: Pubkey,
    /// The token whose fee stream this NFT shares.
    pub subject_mint: Pubkey,
    /// Fraction of the token's fee stream, in basis points.
    pub share_bps: u16,
    /// Accumulator snapshot (`accrued(share_bps, acc)`) at last settle.
    pub reward_debt: u128,
    /// Settled-but-unclaimed fees.
    pub unclaimed: u64,
    pub bump: u8,
}

/// Per-token pool of genesis fees, split pro-rata across that token's genesis
/// NFTs by `share_bps`. One PDA per subject mint.
#[account]
#[derive(InitSpace)]
pub struct GenesisPool {
    pub subject_mint: Pubkey,
    /// Sum of `share_bps` across the token's minted genesis NFTs.
    pub total_share_bps: u64,
    /// Cumulative fee per share-bps, scaled by `revenue::ACC_SCALE`.
    pub acc_per_share: u128,
    /// Lamports of deposited fees still available to claim.
    pub reserves: u64,
    pub bump: u8,
}

/// A Dutch auction for a single 1-of-1 Metaplex Core NFT (art/music verticals).
/// The asset is escrowed under this PDA (which owns it) until sold; price
/// descends from `start_price` to `floor_price`. One PDA per asset.
#[account]
#[derive(InitSpace)]
pub struct NftAuction {
    /// The 1-of-1 Core asset being sold.
    pub asset: Pubkey,
    /// Seller who receives the proceeds.
    pub creator: Pubkey,
    /// Ceiling price in lamports (absolute, for the single NFT).
    pub start_price: u64,
    /// Floor price in lamports.
    pub floor_price: u64,
    pub start_time: i64,
    pub duration: i64,
    pub complete: bool,
    pub bump: u8,
}

/// Native constant-product AMM pool created when a bonding curve graduates.
/// Holds the migrated real SOL + remaining tokens; trades `x*y=k`. One PDA per mint.
#[account]
#[derive(InitSpace)]
pub struct AmmPool {
    pub mint: Pubkey,
    /// Real SOL in the pool (lamports held in this account, above rent).
    pub sol_reserves: u64,
    /// Tokens in the pool vault.
    pub token_reserves: u64,
    pub bump: u8,
}

/// Mindshare rank tier supplied by the (trusted, off-chain) launch keeper.
/// Determines the curve's starting virtual SOL reserve.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MindshareTier {
    /// Unknown account (~$69 seed).
    NewEntrant,
    /// Rising builder / analyst, top ~1K (~$800 seed).
    Emerging,
    /// Established crypto voice, top 100 (~$4K seed).
    Top100,
    /// Major KOL, top 10 (~$15K seed).
    Top10,
}

impl MindshareTier {
    /// Starting virtual SOL reserve (lamports) for this tier.
    pub fn seed_virtual_sol(self) -> u64 {
        match self {
            MindshareTier::NewEntrant => SEED_NEW_ENTRANT,
            MindshareTier::Emerging => SEED_EMERGING,
            MindshareTier::Top100 => SEED_TOP_100,
            MindshareTier::Top10 => SEED_TOP_10,
        }
    }

    /// Stable numeric discriminant stored on the curve account.
    pub fn as_u8(self) -> u8 {
        match self {
            MindshareTier::NewEntrant => 0,
            MindshareTier::Emerging => 1,
            MindshareTier::Top100 => 2,
            MindshareTier::Top10 => 3,
        }
    }
}
