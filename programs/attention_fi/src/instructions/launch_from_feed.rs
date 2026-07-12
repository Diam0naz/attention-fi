use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};
use switchboard_on_demand::{PullFeedAccountData, ON_DEMAND_MAINNET_PID};

use crate::constants::{CURVE_SEED, FEED_MAX_STALENESS, FEED_MIN_SAMPLES, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::{LaunchEvent, MECH_BONDING};
use crate::oracle::tier_from_mindshare_bps;
use crate::state::{BondingCurve, Global};

#[derive(Accounts)]
pub struct LaunchFromFeed<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: Switchboard On-Demand pull feed; owner-checked here and parsed +
    /// staleness-validated in the handler.
    #[account(owner = ON_DEMAND_MAINNET_PID @ AttentionError::InvalidFeed)]
    pub feed: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = global.token_decimals,
        mint::authority = curve,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + BondingCurve::INIT_SPACE,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

/// Launch a bonding-curve token whose starting price is seeded from a decentralized
/// Switchboard mindshare feed rather than a trusted keeper `tier` argument.
pub fn launch_from_feed_handler(ctx: Context<LaunchFromFeed>) -> Result<()> {
    let clock = Clock::get()?;

    // Read the current mindshare value from the oracle (fresh + enough samples).
    let feed_info = ctx.accounts.feed.to_account_info();
    let feed = PullFeedAccountData::parse(feed_info.data.borrow())
        .map_err(|_| error!(AttentionError::InvalidFeed))?;
    let value = feed
        .get_value(clock.slot, FEED_MAX_STALENESS, FEED_MIN_SAMPLES, true)
        .map_err(|_| error!(AttentionError::StaleFeed))?;

    // Feed publishes mindshare as a percent (e.g. 3.24 => 3.24%). Convert to bps.
    let mantissa = u128::try_from(value.mantissa().max(0)).unwrap_or(0);
    let denom = 10u128
        .checked_pow(value.scale())
        .ok_or(AttentionError::MathOverflow)?;
    let bps = mantissa
        .checked_mul(100)
        .and_then(|scaled| scaled.checked_div(denom))
        .ok_or(AttentionError::MathOverflow)?;
    let tier = tier_from_mindshare_bps(u64::try_from(bps).unwrap_or(u64::MAX));

    let global = &ctx.accounts.global;
    let total_supply = global.token_total_supply;
    let virtual_token_reserves = global.virtual_token_reserves;

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.curve;
    let signer_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[bump]]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        total_supply,
    )?;

    token::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.curve.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    let curve = &mut ctx.accounts.curve;
    curve.mint = mint_key;
    curve.creator = ctx.accounts.creator.key();
    curve.virtual_sol_reserves = tier.seed_virtual_sol();
    curve.virtual_token_reserves = virtual_token_reserves;
    curve.real_sol_reserves = 0;
    curve.real_token_reserves = total_supply;
    curve.token_total_supply = total_supply;
    curve.creator_fees = 0;
    curve.tier = tier.as_u8();
    curve.complete = false;
    curve.bump = bump;

    emit!(LaunchEvent {
        mint: mint_key,
        creator: ctx.accounts.creator.key(),
        mechanism: MECH_BONDING,
        tier: tier.as_u8(),
        virtual_sol_reserves: tier.seed_virtual_sol(),
        virtual_token_reserves,
        timestamp: clock.unix_timestamp,
    });

    let global = &mut ctx.accounts.global;
    global.tokens_launched = global
        .tokens_launched
        .checked_add(1)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
