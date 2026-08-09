use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    CURVE_SEED, GENPOOL_SEED, GLOBAL_SEED, GUARDIANS_SEED, PERK_SEED, TRADER_SEED,
};
use crate::curve::{sell_quote, split_creator_fee};
use crate::error::AttentionError;
use crate::events::TradeEvent;
use crate::guardians;
use crate::nft::{discounted_fee_bps, perk_discount_bps};
use crate::perks;
use crate::revenue::{credit_genesis_pool, genesis_share_bps, split_genesis_fee};
use crate::state::{BondingCurve, Global, PerkNft, TraderStats};

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = curve)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = seller)]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// Optional perk NFT owned by the seller; grants a trading-fee discount.
    #[account(
        seeds = [PERK_SEED, perk.asset.as_ref()],
        bump = perk.bump,
        constraint = perk.owner == seller.key() @ AttentionError::Unauthorized,
    )]
    pub perk: Option<Account<'info, PerkNft>>,

    /// Optional cumulative-activity record for the seller, credited with this
    /// trade's SOL. Optional for the reason set out in `perks::record_activity`:
    /// leaving it out forfeits progress toward your own fee discount and costs
    /// nobody else anything. A TS caller still has to name it
    /// (`traderStats: null`), as it already does for `perk`.
    #[account(
        mut,
        seeds = [TRADER_SEED, seller.key().as_ref()],
        bump = trader_stats.bump,
    )]
    pub trader_stats: Option<Account<'info, TraderStats>>,

    /// The token's genesis fee pool.
    ///
    /// Required, and unchecked because it may legitimately not exist: most
    /// tokens never issue genesis NFTs. Whether it exists is read from the
    /// chain below rather than inferred from whether the caller bothered to
    /// pass it. As an `Option` this was a hole — omitting it made
    /// `total_share_bps` read as zero, so the whole creator fee accrued to the
    /// creator and the holders who had paid for a share of that stream were
    /// simply skipped. It cost the trader nothing to omit, and the creator was
    /// the one who gained.
    ///
    /// CHECK: the seeds pin the address, so a caller cannot substitute another
    /// account; the handler validates the contents before trusting them.
    #[account(mut, seeds = [GENPOOL_SEED, mint.key().as_ref()], bump)]
    pub genesis_pool: UncheckedAccount<'info>,

    /// The emergency stop.
    ///
    /// Required, never optional: an optional stop is not a stop — omitting it
    /// would help the caller, which is exactly the shape that made the genesis
    /// pool exploitable. Unchecked because an empty account is the legitimate
    /// "no guardian set installed yet" state rather than an error.
    ///
    /// CHECK: seeds pin the address; `guardians::require_live` validates it.
    #[account(seeds = [GUARDIANS_SEED], bump)]
    pub guardians: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn sell_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Sell<'info>>,
    token_amount: u64,
    min_sol_out: u64,
) -> Result<()> {
    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(token_amount > 0, AttentionError::ZeroAmount);
    require!(!ctx.accounts.curve.complete, AttentionError::CurveComplete);

    let global = &ctx.accounts.global;
    let curve = &ctx.accounts.curve;
    let fee_bps = match &ctx.accounts.perk {
        // Derived from level rather than read from perk.discount_bps: the
        // stored field was written under whatever the discount meant on the
        // day the perk was minted, so reading it would leave older NFTs on
        // stale terms after any retune.
        Some(perk) => discounted_fee_bps(global.fee_bps, perk_discount_bps(perk.level)),
        None => global.fee_bps,
    };
    let quote = sell_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        token_amount,
        fee_bps,
    )?;
    require!(
        quote.sol_out >= min_sol_out,
        AttentionError::SlippageExceeded
    );
    require!(
        quote.sol_from_curve <= curve.real_sol_reserves,
        AttentionError::InsufficientReserves
    );

    // Seller -> vault (tokens).
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        token_amount,
    )?;

    // Split the fee: creator cut stays accrued in the curve, protocol cut to treasury.
    let (creator_cut, treasury_cut) = split_creator_fee(quote.fee, global.creator_fee_share_bps)?;
    // The genesis holders' slice comes out of the creator's half, so the
    // treasury's share and the trader's cost are untouched by it.
    // Existence is a fact about the chain, not about the transaction.
    let pool_info = ctx.accounts.genesis_pool.to_account_info();
    let total_share_bps = genesis_share_bps(&pool_info)?;
    let (genesis_cut, creator_cut) = split_genesis_fee(creator_cut, total_share_bps)?;
    // The creator's retained cut stays in the curve; everything else leaves it.
    let curve_debit = quote
        .sol_from_curve
        .checked_sub(creator_cut)
        .ok_or(AttentionError::MathOverflow)?;

    // Curve -> seller (net) and curve -> treasury (protocol cut). The curve PDA is
    // program-owned, so lamports are moved directly rather than via a system CPI.
    **ctx
        .accounts
        .curve
        .to_account_info()
        .try_borrow_mut_lamports()? -= curve_debit;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? += quote.sol_out;
    if treasury_cut > 0 {
        **ctx
            .accounts
            .treasury
            .to_account_info()
            .try_borrow_mut_lamports()? += treasury_cut;
    }
    // Curve -> genesis pool. Both are program-owned, so this is a direct
    // lamport move like the two above rather than a system CPI.
    if genesis_cut > 0 {
        **pool_info.try_borrow_mut_lamports()? += genesis_cut;
        credit_genesis_pool(&pool_info, genesis_cut)?;
    }

    // Update reserves and emit.
    let seller_key = ctx.accounts.seller.key();
    let now = Clock::get()?.unix_timestamp;
    let curve = &mut ctx.accounts.curve;
    curve.virtual_token_reserves = curve
        .virtual_token_reserves
        .checked_add(token_amount)
        .ok_or(AttentionError::MathOverflow)?;
    curve.virtual_sol_reserves = curve
        .virtual_sol_reserves
        .checked_sub(quote.sol_from_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_token_reserves = curve
        .real_token_reserves
        .checked_add(token_amount)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_sol_reserves = curve
        .real_sol_reserves
        .checked_sub(quote.sol_from_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.creator_fees = curve
        .creator_fees
        .checked_add(creator_cut)
        .ok_or(AttentionError::MathOverflow)?;

    emit!(TradeEvent {
        mint: curve.mint,
        user: seller_key,
        is_buy: false,
        sol_amount: quote.sol_out,
        token_amount,
        fee: quote.fee,
        virtual_sol_reserves: curve.virtual_sol_reserves,
        virtual_token_reserves: curve.virtual_token_reserves,
        real_sol_reserves: curve.real_sol_reserves,
        timestamp: now,
    });

    // Credit this trade's volume toward the trader's perk level. Skipped
    // silently when the account isn't supplied — see `perks::record_activity`.
    perks::record_activity(
        ctx.accounts.trader_stats.as_deref_mut(),
        seller_key,
        quote.sol_out,
        0,
    )?;

    Ok(())
}
