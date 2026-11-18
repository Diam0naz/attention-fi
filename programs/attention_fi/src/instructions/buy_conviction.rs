use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    CONVICTION_SEED, DISAVOW_SEED, GLOBAL_SEED, GUARDIANS_SEED, POSITION_SEED, TRADER_SEED,
};
use crate::curve::buy_quote;
use crate::error::AttentionError;
use crate::guardians;
use crate::instructions::disavow_token::require_not_disavowed;
use crate::perks;
use crate::state::{ConvictionCurve, ConvictionPosition, Global, TraderStats};

#[derive(Accounts)]
pub struct BuyConviction<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// Optional cumulative-activity record for the buyer. Capital committed
    /// here counts as a *deposit* rather than volume — `activity_score` weights
    /// deposits double, because locking money up is a stronger signal than a
    /// trade that can be reversed in the next block.
    #[account(
        mut,
        seeds = [TRADER_SEED, buyer.key().as_ref()],
        bump = trader_stats.bump,
    )]
    pub trader_stats: Option<Box<Account<'info, TraderStats>>>,

    #[account(
        mut,
        seeds = [CONVICTION_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Box<Account<'info, ConvictionCurve>>,

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

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + ConvictionPosition::INIT_SPACE,
        seeds = [POSITION_SEED, mint.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, ConvictionPosition>>,

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

pub fn buy_conviction_handler(
    ctx: Context<BuyConviction>,
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
    let quote = buy_quote(
        curve.virtual_sol_reserves,
        curve.virtual_token_reserves,
        curve.real_token_reserves,
        sol_amount,
        global.fee_bps,
    )?;
    require!(quote.tokens_out > 0, AttentionError::ZeroAmount);
    require!(
        quote.tokens_out >= min_tokens_out,
        AttentionError::SlippageExceeded
    );

    // Buyer -> curve reserves.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.curve.to_account_info(),
            },
        ),
        quote.sol_into_curve,
    )?;

    // Buyer -> treasury (fee).
    if quote.fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            quote.fee,
        )?;
    }

    // Vault -> buyer, curve PDA signs.
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[CONVICTION_SEED, mint_key.as_ref(), &[curve.bump]]];
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

    // Update reserves.
    let lock_period = curve.lock_period;
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

    // Re-lock the holder's whole position until now + lock_period.
    let now = Clock::get()?.unix_timestamp;
    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.buyer.key();
    position.mint = mint_key;
    position.amount = position
        .amount
        .checked_add(quote.tokens_out)
        .ok_or(AttentionError::MathOverflow)?;
    position.unlock_time = now
        .checked_add(lock_period)
        .ok_or(AttentionError::MathOverflow)?;
    position.bump = ctx.bumps.position;

    // Credit this trade's committed capital toward the trader's perk level. Skipped
    // silently when the account isn't supplied — see `perks::record_activity`.
    perks::record_activity(
        ctx.accounts
            .trader_stats
            .as_deref_mut()
            .map(|stats| &mut **stats),
        ctx.accounts.buyer.key(),
        0,
        quote.sol_charged,
    )?;

    Ok(())
}
