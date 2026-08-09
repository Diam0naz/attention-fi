use anchor_lang::prelude::*;
use mpl_core::accounts::BaseAssetV1;

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
        has_one = asset,
    )]
    pub genesis: Account<'info, GenesisNft>,

    /// CHECK: the Core asset this claim belongs to; bound by the record's
    /// `has_one = asset`, and read below to find who owns it now.
    pub asset: UncheckedAccount<'info>,
}

/// Claim a genesis NFT holder's accrued share of the token's fee stream.
///
/// Authorised against the asset's **current** owner, read from the Core account
/// itself. The record's `owner` field is a cache written when the NFT was
/// issued, and these NFTs are deliberately transferable — nothing froze them,
/// because a fee-share right is meant to trade. Gating on the cache meant the
/// right never moved with the asset: whoever sold their NFT kept drawing the
/// income, and whoever bought it received a claim on nothing. That is not a
/// theft someone has to attempt; it is what an ordinary secondary sale did.
///
/// The cache is refreshed here rather than deleted, because it is what the
/// portfolio views read to list a wallet's holdings without fetching every Core
/// account. It is now a convenience that follows the truth instead of standing
/// in for it.
///
/// One consequence worth stating plainly: unclaimed fees travel with the NFT.
/// Accrual is a property of the asset, not of who held it while the trades
/// happened, so a seller who doesn't claim before transferring hands the
/// balance to the buyer along with everything else.
pub fn claim_genesis_fee_handler(ctx: Context<ClaimGenesisFee>) -> Result<()> {
    let owner = {
        let data = ctx.accounts.asset.try_borrow_data()?;
        let record = BaseAssetV1::from_bytes(&data).map_err(|_| AttentionError::InvalidAsset)?;
        require!(
            record.key == mpl_core::types::Key::AssetV1,
            AttentionError::InvalidAsset
        );
        record.owner
    };
    require!(
        owner == ctx.accounts.holder.key(),
        AttentionError::Unauthorized
    );

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
    genesis.owner = owner;
    genesis.unclaimed = 0;
    genesis.reward_debt = accrued(share, acc)?;

    Ok(())
}
