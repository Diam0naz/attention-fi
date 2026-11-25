use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

use crate::constants::FEATUREGATE_SEED;
use crate::constants::{AUCTION_SEED, GLOBAL_SEED, LAUNCHPOLICY_SEED, LAUNCHQUOTA_SEED};
use crate::error::AttentionError;
use crate::features::{self, FEATURE_DUTCH};
use crate::launch_quota;
use crate::metadata::{create_token_metadata, MetadataCpi, TokenMetadataArgs};
use crate::state::{DutchAuction, Global, LaunchQuota, MindshareTier};

#[derive(Accounts)]
pub struct StartAuction<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// New SPL mint (client-generated keypair, signs creation).
    #[account(
        init,
        payer = creator,
        mint::decimals = global.token_decimals,
        mint::authority = auction,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + DutchAuction::INIT_SPACE,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, DutchAuction>,

    /// Auction-owned vault holding the full allocation for sale.
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = auction,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: the token's Metaplex metadata PDA, created by the CPI in the
    /// handler and validated by the Token Metadata program against `mint`.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex Token Metadata program, validated by address.
    #[account(address = anchor_spl::metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    /// The launch policy — how many launches a wallet gets per window.
    ///
    /// CHECK: seeds pin the address; absent means the defaults apply, which is
    /// what keeps a fresh deployment bounded rather than unlimited.
    #[account(seeds = [LAUNCHPOLICY_SEED], bump)]
    pub launch_policy: UncheckedAccount<'info>,

    /// This creator's recent launches. Created on their first one, paid for by
    /// them — the rate limit costs the protocol nothing to enforce.
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + LaunchQuota::INIT_SPACE,
        seeds = [LAUNCHQUOTA_SEED, creator.key().as_ref()],
        bump,
    )]
    pub launch_quota: Account<'info, LaunchQuota>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn start_auction_handler(
    ctx: Context<StartAuction>,
    tier: MindshareTier,
    start_price: u64,
    floor_price: u64,
    duration: i64,
    metadata: TokenMetadataArgs,
) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_DUTCH)?;
    // One quota across every mechanism: a per-instruction limit is four times
    // the limit to anyone willing to call a different one.
    let (max_launches, window_secs) =
        launch_quota::policy_or_default(&ctx.accounts.launch_policy.to_account_info())?;
    let now_ts = Clock::get()?.unix_timestamp;
    let quota_bump = ctx.bumps.launch_quota;
    let quota = &mut ctx.accounts.launch_quota;
    quota.creator = ctx.accounts.creator.key();
    quota.bump = quota_bump;
    launch_quota::record_launch(&mut quota.stamps, now_ts, max_launches, window_secs)?;

    require!(
        start_price >= floor_price,
        AttentionError::InvalidAuctionParams
    );
    require!(floor_price > 0, AttentionError::InvalidAuctionParams);
    require!(duration > 0, AttentionError::InvalidAuctionParams);

    let global = &ctx.accounts.global;
    let total_supply = global.token_total_supply;

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.auction;
    let signer_seeds: &[&[&[u8]]] = &[&[AUCTION_SEED, mint_key.as_ref(), &[bump]]];

    // Mint the entire allocation into the auction vault.
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.auction.to_account_info(),
            },
            signer_seeds,
        ),
        total_supply,
    )?;

    // Name the token on-chain, before the authority is revoked below.
    //
    // Order is load-bearing: CreateMetadataAccountV3 requires the mint
    // authority to sign, so once the revoke below sets it to None this mint can
    // never have metadata. A token launched without it shows as a bare address
    // in every wallet and explorer, permanently.
    create_token_metadata(
        MetadataCpi {
            metadata: ctx.accounts.metadata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            mint_authority: ctx.accounts.auction.to_account_info(),
            payer: ctx.accounts.creator.to_account_info(),
            update_authority: ctx.accounts.auction.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        },
        signer_seeds,
        metadata,
    )?;

    // Fix the supply.
    token::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.auction.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;
    auction.mint = mint_key;
    auction.creator = ctx.accounts.creator.key();
    auction.start_price = start_price;
    auction.floor_price = floor_price;
    auction.start_time = now;
    auction.duration = duration;
    auction.total_for_sale = total_supply;
    auction.tokens_sold = 0;
    auction.real_sol_reserves = 0;
    auction.tier = tier.as_u8();
    auction.complete = false;
    auction.bump = bump;

    let global = &mut ctx.accounts.global;
    global.tokens_launched = global
        .tokens_launched
        .checked_add(1)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
