use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    CURVE_SEED, DISAVOW_SEED, GENPOOL_SEED, GLOBAL_SEED, GUARDIANS_SEED, PERK_SEED, TRADER_SEED,
};
use crate::curve::{buy_quote, split_creator_fee};
use crate::error::AttentionError;
use crate::events::{GraduateEvent, TradeEvent};
use crate::guardians;
use crate::instructions::disavow_token::require_not_disavowed;
use crate::nft::{discounted_fee_bps, perk_discount_bps};
use crate::perks;
use crate::revenue::{credit_genesis_pool, genesis_share_bps, split_genesis_fee};
use crate::state::{BondingCurve, Global, PerkNft, TraderStats};

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,
    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Box<Account<'info, BondingCurve>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = curve)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    /// Optional perk NFT owned by the buyer; grants a trading-fee discount.
    /// Constrained to a perk PDA owned by the buyer when supplied.
    #[account(
        seeds = [PERK_SEED, perk.asset.as_ref()],
        bump = perk.bump,
        constraint = perk.owner == buyer.key() @ AttentionError::Unauthorized,
    )]
    pub perk: Option<Box<Account<'info, PerkNft>>>,

    /// Optional cumulative-activity record for the buyer, credited with this
    /// trade's SOL. Optional for the reason set out in `perks::record_activity`:
    /// leaving it out forfeits progress toward your own fee discount and costs
    /// nobody else anything. A TS caller still has to name it
    /// (`traderStats: null`), as it already does for `perk`.
    #[account(
        mut,
        seeds = [TRADER_SEED, buyer.key().as_ref()],
        bump = trader_stats.bump,
    )]
    pub trader_stats: Option<Box<Account<'info, TraderStats>>>,

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

    /// Set when the token's subject has disowned it.
    ///
    /// Only the buy side carries this. Selling and claiming must keep working
    /// on a disowned token — freezing exits would make holders pay for somebody
    /// else's misrepresentation.
    ///
    /// CHECK: seeds pin the address; empty is the ordinary case and means
    /// "not disavowed".
    #[account(seeds = [DISAVOW_SEED, mint.key().as_ref()], bump)]
    pub disavowal: UncheckedAccount<'info>,

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

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn buy_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Buy<'info>>,
    sol_amount: u64,
    min_tokens_out: u64,
) -> Result<()> {
    // A disowned token can be sold, not bought.
    require_not_disavowed(&ctx.accounts.disavowal.to_account_info())?;

    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    require!(sol_amount > 0, AttentionError::ZeroAmount);
    require!(!ctx.accounts.curve.complete, AttentionError::CurveComplete);

    let global = &ctx.accounts.global;
    let curve = &ctx.accounts.curve;
    // A perk NFT held by the buyer reduces the trading fee.
    let fee_bps = match &ctx.accounts.perk {
        // Derived from level rather than read from perk.discount_bps: the
        // stored field was written under whatever the discount meant on the
        // day the perk was minted, so reading it would leave older NFTs on
        // stale terms after any retune.
        Some(perk) => discounted_fee_bps(global.fee_bps, perk_discount_bps(perk.level)),
        None => global.fee_bps,
    };
    let quote = buy_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        curve.real_token_reserves,
        sol_amount,
        fee_bps,
    )?;
    require!(quote.tokens_out > 0, AttentionError::ZeroAmount);
    require!(
        quote.tokens_out >= min_tokens_out,
        AttentionError::SlippageExceeded
    );

    // Split the fee: creator cut accrues in the curve account, protocol cut to treasury.
    let (creator_cut, treasury_cut) = split_creator_fee(quote.fee, global.creator_fee_share_bps)?;
    // The genesis holders' slice comes out of the creator's half, so the
    // treasury's share and the trader's cost are untouched by it.
    // Existence is a fact about the chain, not about the transaction.
    let pool_info = ctx.accounts.genesis_pool.to_account_info();
    let total_share_bps = genesis_share_bps(&pool_info)?;
    let (genesis_cut, creator_cut) = split_genesis_fee(creator_cut, total_share_bps)?;

    // Buyer -> curve (reserves + creator accrual, both held in the curve account).
    let to_curve = quote
        .sol_into_curve
        .checked_add(creator_cut)
        .ok_or(AttentionError::MathOverflow)?;
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.curve.to_account_info(),
            },
        ),
        to_curve,
    )?;

    // Buyer -> genesis pool (holders' slice of the creator's fee).
    if genesis_cut > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: pool_info.clone(),
                },
            ),
            genesis_cut,
        )?;
        credit_genesis_pool(&pool_info, genesis_cut)?;
    }

    // Buyer -> treasury (protocol cut).
    if treasury_cut > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_cut,
        )?;
    }

    // Vault -> buyer (tokens), curve PDA signs.
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[curve.bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        quote.tokens_out,
    )?;

    // Update reserves, emit, and check graduation.
    let graduation_sol = global.graduation_sol;
    let buyer_key = ctx.accounts.buyer.key();
    let now = Clock::get()?.unix_timestamp;
    let curve = &mut ctx.accounts.curve;
    curve.virtual_sol_reserves = curve
        .virtual_sol_reserves
        .checked_add(quote.sol_into_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.virtual_token_reserves = curve
        .virtual_token_reserves
        .checked_sub(quote.tokens_out)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_sol_reserves = curve
        .real_sol_reserves
        .checked_add(quote.sol_into_curve)
        .ok_or(AttentionError::MathOverflow)?;
    curve.real_token_reserves = curve
        .real_token_reserves
        .checked_sub(quote.tokens_out)
        .ok_or(AttentionError::MathOverflow)?;
    curve.creator_fees = curve
        .creator_fees
        .checked_add(creator_cut)
        .ok_or(AttentionError::MathOverflow)?;

    emit!(TradeEvent {
        mint: curve.mint,
        user: buyer_key,
        is_buy: true,
        sol_amount,
        token_amount: quote.tokens_out,
        fee: quote.fee,
        virtual_sol_reserves: curve.virtual_sol_reserves,
        virtual_token_reserves: curve.virtual_token_reserves,
        real_sol_reserves: curve.real_sol_reserves,
        timestamp: now,
    });

    if curve.real_sol_reserves >= graduation_sol {
        curve.complete = true;
        emit!(GraduateEvent {
            mint: curve.mint,
            real_sol_reserves: curve.real_sol_reserves,
            real_token_reserves: curve.real_token_reserves,
            timestamp: now,
        });
    }

    // Credit this trade's volume toward the trader's perk level. Skipped
    // silently when the account isn't supplied — see `perks::record_activity`.
    perks::record_activity(
        ctx.accounts
            .trader_stats
            .as_deref_mut()
            .map(|stats| &mut **stats),
        buyer_key,
        sol_amount,
        0,
    )?;

    Ok(())
}
