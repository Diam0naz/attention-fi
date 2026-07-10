pub mod auction;
pub mod constants;
pub mod conviction;
pub mod curve;
pub mod error;
pub mod instructions;
pub mod nft;
pub mod revenue;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("73g1KYNus6MQqtHiu21cjdEUh3MrydfoWAw2G7dMoUWe");

#[program]
pub mod attention_fi {
    use super::*;

    /// Create the one-time protocol config (fees, treasury, curve defaults).
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::initialize_handler(ctx)
    }

    /// Launch a new token: mint the supply into a curve-owned vault and seed the
    /// bonding curve's starting price from the subject's mindshare tier.
    pub fn launch_token(ctx: Context<LaunchToken>, tier: MindshareTier) -> Result<()> {
        launch_token::launch_token_handler(ctx, tier)
    }

    /// Buy tokens along the curve with SOL (slippage-guarded).
    pub fn buy(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        buy::buy_handler(ctx, sol_amount, min_tokens_out)
    }

    /// Sell tokens back into the curve for SOL (slippage-guarded).
    pub fn sell(ctx: Context<Sell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
        sell::sell_handler(ctx, token_amount, min_sol_out)
    }

    /// Launch a token as a Dutch auction: price descends from `start_price` to
    /// `floor_price` over `duration` seconds (fair launch for narrative tokens).
    pub fn start_auction(
        ctx: Context<StartAuction>,
        tier: MindshareTier,
        start_price: u64,
        floor_price: u64,
        duration: i64,
    ) -> Result<()> {
        start_auction::start_auction_handler(ctx, tier, start_price, floor_price, duration)
    }

    /// Bid on a Dutch auction at the current descending price (price-capped).
    pub fn bid(ctx: Context<Bid>, amount: u64, max_price_per_token: u64) -> Result<()> {
        bid::bid_handler(ctx, amount, max_price_per_token)
    }

    /// Finalize a Dutch auction once it has ended.
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        settle_auction::settle_auction_handler(ctx)
    }

    /// Launch a token on a conviction curve: constant-product pricing plus a
    /// loyalty time-lock and early-exit penalty (for niche/community verticals).
    pub fn launch_conviction(
        ctx: Context<LaunchConviction>,
        tier: MindshareTier,
        lock_period: i64,
        early_exit_penalty_bps: u16,
    ) -> Result<()> {
        launch_conviction::launch_conviction_handler(ctx, tier, lock_period, early_exit_penalty_bps)
    }

    /// Buy on a conviction curve; re-locks the holder's position.
    pub fn buy_conviction(
        ctx: Context<BuyConviction>,
        sol_amount: u64,
        min_tokens_out: u64,
    ) -> Result<()> {
        buy_conviction::buy_conviction_handler(ctx, sol_amount, min_tokens_out)
    }

    /// Sell on a conviction curve; forfeits the early-exit penalty if still locked.
    pub fn sell_conviction(
        ctx: Context<SellConviction>,
        token_amount: u64,
        min_sol_out: u64,
    ) -> Result<()> {
        sell_conviction::sell_conviction_handler(ctx, token_amount, min_sol_out)
    }

    /// Launch a revenue-share token: shares are a pro-rata claim on deposited
    /// revenue (the creator-economy mechanism).
    pub fn launch_revenue(
        ctx: Context<LaunchRevenue>,
        tier: MindshareTier,
        share_price: u64,
    ) -> Result<()> {
        launch_revenue::launch_revenue_handler(ctx, tier, share_price)
    }

    /// Buy revenue shares at the fixed launch price; auto-stakes for revenue.
    pub fn buy_revenue(ctx: Context<BuyRevenue>, amount: u64) -> Result<()> {
        buy_revenue::buy_revenue_handler(ctx, amount)
    }

    /// Deposit revenue to be split pro-rata across current shareholders.
    pub fn deposit_revenue(ctx: Context<DepositRevenue>, amount: u64) -> Result<()> {
        deposit_revenue::deposit_revenue_handler(ctx, amount)
    }

    /// Claim a shareholder's accrued revenue.
    pub fn claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
        claim_revenue::claim_revenue_handler(ctx)
    }

    /// Attest an X handle↔wallet binding and mint a soulbound verification NFT
    /// (Metaplex Core). Keeper-signed for now; SAS attestation later.
    pub fn verify_handle(ctx: Context<VerifyHandle>, handle: String, uri: String) -> Result<()> {
        verify_handle::verify_handle_handler(ctx, handle, uri)
    }

    /// Mint an upgradeable perk NFT (Metaplex Core) granting platform fee
    /// discounts; starts at level 1.
    pub fn mint_perk(ctx: Context<MintPerk>, uri: String) -> Result<()> {
        mint_perk::mint_perk_handler(ctx, uri)
    }

    /// Level up a perk NFT: rewrites its on-chain Attributes and raises its fee
    /// discount (program-controlled via the perk authority PDA).
    pub fn level_up(ctx: Context<LevelUp>) -> Result<()> {
        level_up::level_up_handler(ctx)
    }

    /// Mint a transferable fee-share genesis NFT (Metaplex Core) for a token,
    /// carrying a `share_bps` claim on its fee stream.
    pub fn mint_genesis(ctx: Context<MintGenesis>, share_bps: u16, uri: String) -> Result<()> {
        mint_genesis::mint_genesis_handler(ctx, share_bps, uri)
    }

    /// Start a Dutch auction for a 1-of-1 Core NFT (escrowed under the auction PDA).
    pub fn start_nft_auction(
        ctx: Context<StartNftAuction>,
        start_price: u64,
        floor_price: u64,
        duration: i64,
        name: String,
        uri: String,
    ) -> Result<()> {
        start_nft_auction::start_nft_auction_handler(
            ctx,
            start_price,
            floor_price,
            duration,
            name,
            uri,
        )
    }

    /// Buy the 1-of-1 NFT at the current descending price; transfers it to the buyer.
    pub fn buy_nft(ctx: Context<BuyNft>, max_price: u64) -> Result<()> {
        buy_nft::buy_nft_handler(ctx, max_price)
    }
}
