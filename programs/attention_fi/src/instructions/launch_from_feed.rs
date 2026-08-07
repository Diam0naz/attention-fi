use crate::constants::{CURVE_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::{LaunchEvent, MECH_BONDING};
use crate::metadata::{create_token_metadata, MetadataCpi, TokenMetadataArgs};
use crate::oracle::tier_from_mindshare_bps;
use crate::oracle_feed::read_mindshare_bps;
use crate::state::{BondingCurve, Global};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

#[derive(Accounts)]
pub struct LaunchFromFeed<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: Switchboard On-Demand pull feed. Ownership (devnet or mainnet
    /// Switchboard program) is checked in the handler, then parsed +
    /// staleness-validated — a single `owner =` constraint can't accept either
    /// cluster's program id.
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

    /// CHECK: the token's Metaplex metadata PDA, created by the CPI in the
    /// handler and validated by the Token Metadata program against `mint`.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex Token Metadata program, validated by address.
    #[account(address = anchor_spl::metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

/// Launch a bonding-curve token whose starting price is seeded from a decentralized
/// Switchboard mindshare feed rather than a trusted keeper `tier` argument.
pub fn launch_from_feed_handler(
    ctx: Context<LaunchFromFeed>,
    metadata: TokenMetadataArgs,
) -> Result<()> {
    let clock = Clock::get()?;

    // Read the current mindshare (bps) from the Switchboard feed and map it to a
    // launch tier — a decentralized oracle seeds the price, not a keeper arg.
    let bps = read_mindshare_bps(&ctx.accounts.feed.to_account_info(), clock.slot)?;
    let tier = tier_from_mindshare_bps(bps);

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
            mint_authority: ctx.accounts.curve.to_account_info(),
            payer: ctx.accounts.creator.to_account_info(),
            update_authority: ctx.accounts.curve.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        },
        signer_seeds,
        metadata,
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
