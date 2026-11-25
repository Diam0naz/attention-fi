use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::auction::is_perpetual;
use crate::constants::FEATUREGATE_SEED;
use crate::constants::{
    COLLECTIONAUCTION_SEED, FEECONFIG_SEED, GLOBAL_SEED, MAX_PROMO_DAYS, NFTAUCTION_SEED,
    PROMO_SEED,
};
use crate::error::AttentionError;
use crate::events::ListingPromotedEvent;
use crate::features::{self, FEATURE_NFT};
use crate::state::{CollectionAuction, FeeConfig, Global, NftAuction, Promotion};

/// Seconds in a day.
const DAY: i64 = 86_400;

/// Buy promoted placement for a listing.
///
/// The deliberate alternative to charging rent for listing space. Rent punishes
/// inattention — a listing lapses, or an asset is stuck, because a wallet ran
/// dry on something the owner never meant to sell. Promotion inverts that: the
/// baseline is free and permanent, and money only ever buys *additional*
/// visibility. Nobody loses anything by not paying.
///
/// Anyone may promote any live listing, including a listing that isn't theirs.
/// That's intentional — a collector who wants a piece to find a buyer is
/// welcome to pay for it, and there's no way to grief with it since the payment
/// only ever raises a listing's rank.
///
/// Days stack rather than replace: buying while promotion is still running
/// extends from the existing end, so a top-up never destroys time already
/// bought.
#[derive(Accounts)]
pub struct PromoteListing<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// Holds the daily price, so placement can be repriced without a redeploy.
    #[account(seeds = [FEECONFIG_SEED], bump = fee_config.bump)]
    pub fee_config: Account<'info, FeeConfig>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: the asset or collection being promoted. Which of the two it is
    /// gets settled by the auction account supplied below, whose `has_one`
    /// binds it to this key — so this is never trusted on its own.
    pub subject: UncheckedAccount<'info>,

    /// The listing, when the subject is a single asset.
    #[account(
        seeds = [NFTAUCTION_SEED, subject.key().as_ref()],
        bump = nft_auction.bump,
        constraint = nft_auction.asset == subject.key() @ AttentionError::Unauthorized,
    )]
    pub nft_auction: Option<Account<'info, NftAuction>>,

    /// The listing, when the subject is a whole collection.
    #[account(
        seeds = [COLLECTIONAUCTION_SEED, subject.key().as_ref()],
        bump = collection_auction.bump,
        constraint = collection_auction.collection == subject.key() @ AttentionError::Unauthorized,
    )]
    pub collection_auction: Option<Account<'info, CollectionAuction>>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Promotion::INIT_SPACE,
        seeds = [PROMO_SEED, subject.key().as_ref()],
        bump,
    )]
    pub promotion: Account<'info, Promotion>,

    pub system_program: Program<'info, System>,

    /// Whether this feature still accepts new entries. Unchecked because an
    /// empty account is the legitimate "no gate installed, everything enabled"
    /// state rather than an error.
    ///
    /// CHECK: seeds pin the address; `features::require_enabled` validates it.
    #[account(seeds = [FEATUREGATE_SEED], bump)]
    pub feature_gate: UncheckedAccount<'info>,
}

pub fn promote_listing_handler(
    ctx: Context<PromoteListing>,
    days: u16,
    max_lamports: u64,
) -> Result<()> {
    features::require_enabled(&ctx.accounts.feature_gate.to_account_info(), FEATURE_NFT)?;
    require!(days > 0, AttentionError::InvalidAuctionParams);
    require!(days <= MAX_PROMO_DAYS, AttentionError::InvalidAuctionParams);

    let now = Clock::get()?.unix_timestamp;

    // Exactly one listing account, and it has to still be sellable. Paying to
    // advertise something nobody can buy is the one outcome this instruction
    // must not allow — the money is gone and the promotion does nothing.
    let (live, ends_at) = match (&ctx.accounts.nft_auction, &ctx.accounts.collection_auction) {
        (Some(a), None) => (!a.complete, a.start_time + a.duration),
        (None, Some(c)) => (!c.complete, c.start_time + c.duration),
        // Both would let a caller pass a mismatched pair; neither leaves the
        // subject unverified.
        _ => return Err(AttentionError::Unauthorized.into()),
    };
    require!(live, AttentionError::SoldOut);

    let perpetual = match (&ctx.accounts.nft_auction, &ctx.accounts.collection_auction) {
        (Some(a), None) => is_perpetual(a.duration),
        (None, Some(c)) => is_perpetual(c.duration),
        _ => unreachable!("pair already validated above"),
    };
    if !perpetual {
        require!(now < ends_at, AttentionError::AuctionEnded);
    }

    let lamports = u64::from(days)
        .checked_mul(ctx.accounts.fee_config.promo_lamports_per_day)
        .ok_or(AttentionError::MathOverflow)?;
    // The price is read at execution, not at signing, so the payer states what
    // they agreed to. Without this the only thing standing between a pending
    // promotion and an arbitrary debit was the authority's good behaviour.
    require!(lamports <= max_lamports, AttentionError::CostAboveMax);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        lamports,
    )?;

    // Stack onto whatever is left rather than restarting from now, so topping
    // up early never costs the buyer the remainder they already paid for.
    let promotion = &mut ctx.accounts.promotion;
    let base = promotion.promoted_until.max(now);
    let added = i64::from(days)
        .checked_mul(DAY)
        .ok_or(AttentionError::MathOverflow)?;

    promotion.subject = ctx.accounts.subject.key();
    promotion.payer = ctx.accounts.payer.key();
    promotion.promoted_until = base
        .checked_add(added)
        .ok_or(AttentionError::MathOverflow)?;
    promotion.total_paid = promotion
        .total_paid
        .checked_add(lamports)
        .ok_or(AttentionError::MathOverflow)?;
    promotion.bump = ctx.bumps.promotion;

    emit!(ListingPromotedEvent {
        subject: promotion.subject,
        payer: promotion.payer,
        days,
        lamports,
        promoted_until: promotion.promoted_until,
        timestamp: now,
    });
    Ok(())
}
