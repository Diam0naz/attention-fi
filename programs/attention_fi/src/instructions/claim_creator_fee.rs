use anchor_lang::prelude::*;

use crate::constants::{CURVE_SEED, VERIFY_SEED};
use crate::error::AttentionError;
use crate::events::CreatorClaimEvent;
use crate::state::{BondingCurve, Verification};

#[derive(Accounts)]
pub struct ClaimCreatorFee<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: only used to derive the curve PDA; bound by `curve.has_one = mint`.
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
        has_one = creator,
    )]
    pub curve: Account<'info, BondingCurve>,

    /// The creator's SAS verification record. Its existence at this PDA gates the
    /// claim — an unverified creator cannot construct a valid transaction, which
    /// is exactly the brief's "claimable by the X account owner once they verify".
    #[account(
        seeds = [VERIFY_SEED, creator.key().as_ref()],
        bump = verification.bump,
        constraint = verification.subject == creator.key() @ AttentionError::Unauthorized,
    )]
    pub verification: Account<'info, Verification>,
}

pub fn claim_creator_fee_handler(ctx: Context<ClaimCreatorFee>) -> Result<()> {
    let owed = ctx.accounts.curve.creator_fees;
    require!(owed > 0, AttentionError::NoCreatorFees);

    // Curve (program-owned) -> creator, via direct lamport move.
    **ctx
        .accounts
        .curve
        .to_account_info()
        .try_borrow_mut_lamports()? -= owed;
    **ctx
        .accounts
        .creator
        .to_account_info()
        .try_borrow_mut_lamports()? += owed;

    let mint = ctx.accounts.curve.mint;
    let creator_key = ctx.accounts.creator.key();
    let curve = &mut ctx.accounts.curve;
    curve.creator_fees = 0;

    emit!(CreatorClaimEvent {
        mint,
        creator: creator_key,
        amount: owed,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
