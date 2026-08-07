use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

use crate::constants::{CURVE_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::events::{LaunchEvent, MECH_BONDING};
use crate::metadata::{create_token_metadata, MetadataCpi, TokenMetadataArgs};
use crate::state::{BondingCurve, Global, MindshareTier};

#[derive(Accounts)]
pub struct LaunchToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// New SPL mint for the token (client-generated keypair, signs creation).
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

    /// Curve-owned vault that holds the full token supply for sale.
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: the token's Metaplex metadata PDA, created by the CPI below and
    /// validated by the Token Metadata program against `mint`.
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

pub fn launch_token_handler(
    ctx: Context<LaunchToken>,
    tier: MindshareTier,
    metadata: TokenMetadataArgs,
) -> Result<()> {
    let global = &ctx.accounts.global;
    let total_supply = global.token_total_supply;
    let virtual_token_reserves = global.virtual_token_reserves;

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.curve;
    let signer_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[bump]]];

    // Mint the entire supply into the curve vault.
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
    // authority to sign, so once the next call sets it to None this mint can
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

    // Fix the supply: no further minting is possible.
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
        timestamp: Clock::get()?.unix_timestamp,
    });

    let global = &mut ctx.accounts.global;
    global.tokens_launched = global
        .tokens_launched
        .checked_add(1)
        .ok_or(AttentionError::MathOverflow)?;

    Ok(())
}
