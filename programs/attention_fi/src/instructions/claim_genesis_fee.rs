use anchor_lang::prelude::*;

use crate::constants::{GENESIS_SEED, GENPOOL_SEED};
use crate::error::AttentionError;
use crate::revenue::{accrued, pending};
use crate::state::{GenesisNft, GenesisPool};

#[derive(Accounts)]
pub struct ClaimGenesisFee<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(
        mut,
        seeds = [GENPOOL_SEED, genesis.subject_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, GenesisPool>,

    #[account(
        mut,
        seeds = [GENESIS_SEED, genesis.asset.as_ref()],
        bump = genesis.bump,
        has_one = owner,
    )]
    pub genesis: Account<'info, GenesisNft>,

    /// CHECK: bound by the genesis NFT's `has_one = owner`; equals the holder.
    #[account(address = holder.key())]
    pub owner: UncheckedAccount<'info>,
}

/// Claim a genesis NFT holder's accrued share of the token's fee stream.
pub fn claim_genesis_fee_handler(ctx: Context<ClaimGenesisFee>) -> Result<()> {
    let acc = ctx.accounts.pool.acc_per_share;
    let genesis = &ctx.accounts.genesis;
    let share = u64::from(genesis.share_bps);

    let owed = genesis
        .unclaimed
        .checked_add(pending(share, acc, genesis.reward_debt)?)
        .ok_or(AttentionError::MathOverflow)?;
    require!(
        owed <= ctx.accounts.pool.reserves,
        AttentionError::InsufficientReserves
    );

    if owed > 0 {
        **ctx
            .accounts
            .pool
            .to_account_info()
            .try_borrow_mut_lamports()? -= owed;
        **ctx
            .accounts
            .holder
            .to_account_info()
            .try_borrow_mut_lamports()? += owed;
    }

    let pool = &mut ctx.accounts.pool;
    pool.reserves = pool
        .reserves
        .checked_sub(owed)
        .ok_or(AttentionError::MathOverflow)?;

    let genesis = &mut ctx.accounts.genesis;
    genesis.unclaimed = 0;
    genesis.reward_debt = accrued(share, acc)?;

    Ok(())
}
