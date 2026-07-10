use anchor_lang::prelude::*;

use crate::constants::{AUCTION_SEED, GLOBAL_SEED};
use crate::error::AttentionError;
use crate::state::{DutchAuction, Global};

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    pub caller: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump = auction.bump,
        has_one = mint,
    )]
    pub auction: Account<'info, DutchAuction>,

    /// CHECK: only used to derive the auction PDA / has_one check.
    pub mint: UncheckedAccount<'info>,
}

/// Finalize an auction once it has ended (or already sold out). Marks it
/// `complete` so no further bids are accepted; leftover vault tokens remain for
/// a later graduation/burn step.
pub fn settle_auction_handler(ctx: Context<SettleAuction>) -> Result<()> {
    let auction = &ctx.accounts.auction;
    if auction.complete {
        return Ok(());
    }

    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= auction.start_time + auction.duration,
        AttentionError::AuctionNotEnded
    );

    ctx.accounts.auction.complete = true;
    Ok(())
}
