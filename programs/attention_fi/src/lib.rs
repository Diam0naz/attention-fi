pub mod amm;
pub mod auction;
pub mod config;
pub mod constants;
pub mod conviction;
pub mod curve;
pub mod error;
pub mod events;
pub mod genesis;
pub mod instructions;
pub mod metadata;
pub mod nft;
pub mod oracle;
pub mod oracle_feed;
pub mod revenue;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use metadata::TokenMetadataArgs;
pub use state::*;

declare_id!("8fQW2JbfNytdjJ7LR8dvKWMUtpeQPRqxAa3JZvBLsVVc");

#[program]
pub mod attention_fi {
    use super::*;

    /// Create the one-time protocol config (fees, treasury, curve defaults).
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::initialize_handler(ctx)
    }

    /// Launch a new token: mint the supply into a curve-owned vault and seed the
    /// bonding curve's starting price from the subject's mindshare tier.
    pub fn launch_token(
        ctx: Context<LaunchToken>,
        tier: MindshareTier,
        metadata: TokenMetadataArgs,
    ) -> Result<()> {
        launch_token::launch_token_handler(ctx, tier, metadata)
    }

    /// Launch a bonding-curve token seeded from a Switchboard mindshare feed
    /// (decentralized oracle) instead of a trusted keeper tier argument.
    pub fn launch_from_feed(
        ctx: Context<LaunchFromFeed>,
        metadata: TokenMetadataArgs,
    ) -> Result<()> {
        launch_from_feed::launch_from_feed_handler(ctx, metadata)
    }

    /// Refresh a token's on-chain mindshare snapshot from the Switchboard feed
    /// (permissionless crank; the value is trusted from the oracle, not the caller).
    pub fn update_mindshare(ctx: Context<UpdateMindshare>) -> Result<()> {
        update_mindshare::update_mindshare_handler(ctx)
    }

    /// Buy tokens along the curve with SOL (slippage-guarded).
    pub fn buy(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        buy::buy_handler(ctx, sol_amount, min_tokens_out)
    }

    /// Sell tokens back into the curve for SOL (slippage-guarded).
    pub fn sell(ctx: Context<Sell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
        sell::sell_handler(ctx, token_amount, min_sol_out)
    }

    /// Claim a token's accrued creator fees — gated on the creator being
    /// SAS-verified (they must hold a `Verification` record).
    pub fn claim_creator_fee(ctx: Context<ClaimCreatorFee>) -> Result<()> {
        claim_creator_fee::claim_creator_fee_handler(ctx)
    }

    /// Migrate a graduated curve's liquidity into a native AMM pool (permissionless).
    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        graduate::graduate_handler(ctx)
    }

    /// Swap on a graduated token's AMM pool. `is_buy` = SOL in / tokens out.
    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
        is_buy: bool,
    ) -> Result<()> {
        swap::swap_handler(ctx, amount_in, min_amount_out, is_buy)
    }

    /// Launch a token as a Dutch auction: price descends from `start_price` to
    /// `floor_price` over `duration` seconds (fair launch for narrative tokens).
    pub fn start_auction(
        ctx: Context<StartAuction>,
        tier: MindshareTier,
        start_price: u64,
        floor_price: u64,
        duration: i64,
        metadata: TokenMetadataArgs,
    ) -> Result<()> {
        start_auction::start_auction_handler(
            ctx,
            tier,
            start_price,
            floor_price,
            duration,
            metadata,
        )
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
        metadata: TokenMetadataArgs,
    ) -> Result<()> {
        launch_conviction::launch_conviction_handler(
            ctx,
            tier,
            lock_period,
            early_exit_penalty_bps,
            metadata,
        )
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
        metadata: TokenMetadataArgs,
    ) -> Result<()> {
        launch_revenue::launch_revenue_handler(ctx, tier, share_price, metadata)
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

    /// Verify an X handle↔wallet binding against a Solana Attestation Service
    /// attestation and mint a soulbound verification NFT (Metaplex Core).
    pub fn verify_handle(ctx: Context<VerifyHandle>, handle: String, uri: String) -> Result<()> {
        verify_handle::verify_handle_handler(ctx, handle, uri)
    }

    /// Retune the protocol's trading economics without a redeploy. Each
    /// argument is optional; omitting one leaves that value untouched.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_bps: Option<u16>,
        creator_fee_share_bps: Option<u16>,
        graduation_sol: Option<u64>,
        virtual_token_reserves: Option<u64>,
    ) -> Result<()> {
        update_config::update_config_handler(
            ctx,
            fee_bps,
            creator_fee_share_bps,
            graduation_sol,
            virtual_token_reserves,
        )
    }

    /// Set the NFT market's fee schedule — its sale fee and the daily price of
    /// promoted placement — creating the account on first call.
    pub fn set_fee_config(
        ctx: Context<SetFeeConfig>,
        nft_fee_bps: Option<u16>,
        promo_lamports_per_day: Option<u64>,
    ) -> Result<()> {
        set_fee_config::set_fee_config_handler(ctx, nft_fee_bps, promo_lamports_per_day)
    }

    /// Set or rotate the dedicated key authorized to sign SAS attestations
    /// (admin-gated by `Global.authority`).
    pub fn set_issuer(ctx: Context<SetIssuer>, issuer: Pubkey) -> Result<()> {
        set_issuer::set_issuer_handler(ctx, issuer)
    }

    /// Hand protocol authority to a different wallet. Both the current and the
    /// incoming authority must sign, so authority can't be sent to a mistyped
    /// address that nobody controls.
    pub fn set_authority(ctx: Context<SetAuthority>) -> Result<()> {
        set_authority::set_authority_handler(ctx)
    }

    /// Mint an upgradeable perk NFT (Metaplex Core) granting platform fee
    /// discounts; starts at level 1.
    pub fn mint_perk(ctx: Context<MintPerk>, uri: String) -> Result<()> {
        mint_perk::mint_perk_handler(ctx, uri)
    }

    /// Authorise a wallet to claim a perk NFT, without minting it. Lets the
    /// protocol approve a batch of task completions cheaply — each recipient
    /// pays for their own asset via `claim_perk`.
    pub fn grant_perk(ctx: Context<GrantPerk>, level: u8) -> Result<()> {
        grant_perk::grant_perk_handler(ctx, level)
    }

    /// Claim a perk the protocol authorised via `grant_perk`. The claimant
    /// signs and funds the mint; the grant is consumed so it can't be replayed.
    pub fn claim_perk(ctx: Context<ClaimPerk>, uri: String) -> Result<()> {
        claim_perk::claim_perk_handler(ctx, uri)
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

    /// Open a fixed-price run of genesis fee-share NFTs for a token, escrowing
    /// the collection's update authority so the declared size is binding.
    pub fn list_genesis_group(
        ctx: Context<ListGenesisGroup>,
        total_units: u16,
        share_bps: u16,
        price: u64,
        per_wallet_cap: u16,
    ) -> Result<()> {
        list_genesis_group::list_genesis_group_handler(
            ctx,
            total_units,
            share_bps,
            price,
            per_wallet_cap,
        )
    }

    /// Mint units into a listed genesis group — one Core asset per unit, held
    /// in escrow until bought. Assets are passed as remaining accounts.
    pub fn mint_genesis_batch<'info>(
        ctx: Context<'_, '_, '_, 'info, MintGenesisBatch<'info>>,
        uri: String,
    ) -> Result<()> {
        mint_genesis_batch::mint_genesis_batch_handler(ctx, uri)
    }

    /// Buy one unit from a token's genesis group at the listed price, subject
    /// to the group's per-wallet cap.
    pub fn buy_genesis_unit(ctx: Context<BuyGenesisUnit>, max_price: u64) -> Result<()> {
        buy_genesis_unit::buy_genesis_unit_handler(ctx, max_price)
    }

    /// Mint a plain Core NFT (collectible with an optional image), standalone
    /// or straight into one of the payer's collections.
    pub fn mint_nft(ctx: Context<MintNft>, name: String, uri: String) -> Result<()> {
        mint_nft::mint_nft_handler(ctx, name, uri)
    }

    /// Create a Core collection whose update authority stays with the payer.
    pub fn create_collection(
        ctx: Context<CreateCollection>,
        name: String,
        uri: String,
    ) -> Result<()> {
        create_collection::create_collection_handler(ctx, name, uri)
    }

    /// Move a Core asset the payer controls into one of their collections.
    pub fn add_to_collection(ctx: Context<AddToCollection>) -> Result<()> {
        add_to_collection::add_to_collection_handler(ctx)
    }

    /// Burn a Core asset the caller owns, reclaiming its rent. Core rejects
    /// frozen assets, so soulbound credentials can't be destroyed this way.
    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        burn_nft::burn_nft_handler(ctx)
    }

    /// Take an asset out of a collection, restoring the caller as its update
    /// authority. Also the prerequisite for burning the collection.
    pub fn remove_from_collection(ctx: Context<RemoveFromCollection>) -> Result<()> {
        remove_from_collection::remove_from_collection_handler(ctx)
    }

    /// Delete an empty collection and reclaim its rent. Core rejects this while
    /// it still holds assets.
    pub fn burn_collection(ctx: Context<BurnCollection>) -> Result<()> {
        burn_collection::burn_collection_handler(ctx)
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

    /// List an NFT the caller already owns as a descending 1-of-1 auction.
    /// `start_nft_auction` mints its asset, so it can only list something
    /// created in the same transaction; this escrows an existing one.
    pub fn list_nft_auction(
        ctx: Context<ListNftAuction>,
        start_price: u64,
        floor_price: u64,
        duration: i64,
    ) -> Result<()> {
        list_nft_auction::list_nft_auction_handler(ctx, start_price, floor_price, duration)
    }

    /// Return an unsold 1-of-1 to its lister once the auction window closes.
    /// Without this an expired auction locks the NFT in escrow permanently —
    /// `buy_nft` refuses after the deadline and nothing else can move it.
    pub fn reclaim_nft_auction(ctx: Context<ReclaimNftAuction>) -> Result<()> {
        reclaim_nft_auction::reclaim_nft_auction_handler(ctx)
    }

    /// List a whole mpl-core collection as a descending auction.
    ///
    /// Sells the collection's update authority — the only thing a collection
    /// has to give — which carries every member with it.
    pub fn list_collection_auction(
        ctx: Context<ListCollectionAuction>,
        start_price: u64,
        floor_price: u64,
        duration: i64,
    ) -> Result<()> {
        list_collection_auction::list_collection_auction_handler(
            ctx,
            start_price,
            floor_price,
            duration,
        )
    }

    /// Buy a listed collection at its current descending price.
    pub fn buy_collection(ctx: Context<BuyCollection>, max_price: u64) -> Result<()> {
        buy_collection::buy_collection_handler(ctx, max_price)
    }

    /// Return an unsold collection's update authority to its lister.
    pub fn reclaim_collection_auction(ctx: Context<ReclaimCollectionAuction>) -> Result<()> {
        reclaim_collection_auction::reclaim_collection_auction_handler(ctx)
    }

    /// Buy promoted placement for a live listing, asset or collection.
    ///
    /// The alternative to charging rent for listing space: listing stays free
    /// and perpetual, and money only ever buys extra visibility.
    pub fn promote_listing(ctx: Context<PromoteListing>, days: u16) -> Result<()> {
        promote_listing::promote_listing_handler(ctx, days)
    }

    /// Route a token's fees to its genesis NFT holders (split pro-rata by share).
    pub fn deposit_genesis_fee(ctx: Context<DepositGenesisFee>, amount: u64) -> Result<()> {
        deposit_genesis_fee::deposit_genesis_fee_handler(ctx, amount)
    }

    /// Claim a genesis NFT holder's accrued share of the token's fees.
    pub fn claim_genesis_fee(ctx: Context<ClaimGenesisFee>) -> Result<()> {
        claim_genesis_fee::claim_genesis_fee_handler(ctx)
    }
}
