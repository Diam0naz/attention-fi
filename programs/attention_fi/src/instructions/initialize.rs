use anchor_lang::prelude::*;

use crate::constants::{
    DEFAULT_CREATOR_FEE_SHARE_BPS, DEFAULT_FEE_BPS, DEFAULT_GRADUATION_SOL, DEFAULT_NFT_FEE_BPS,
    DEFAULT_VIRTUAL_TOKEN_RESERVES, FEECONFIG_SEED, GLOBAL_SEED, PROMO_LAMPORTS_PER_DAY,
    TOKEN_DECIMALS, TOKEN_TOTAL_SUPPLY,
};
use crate::error::AttentionError;
use crate::state::{FeeConfig, Global};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Global::INIT_SPACE,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub global: Account<'info, Global>,

    /// The NFT market's fee schedule. Created here so a new deployment is
    /// complete in one call; a protocol deployed before this account existed
    /// gets one from `set_fee_config` instead.
    #[account(
        init,
        payer = authority,
        space = 8 + FeeConfig::INIT_SPACE,
        seeds = [FEECONFIG_SEED],
        bump,
    )]
    pub fee_config: Account<'info, FeeConfig>,

    /// CHECK: fee destination. Constrained to a System-owned account so fees can
    /// never be routed into a program-controlled account.
    #[account(owner = anchor_lang::system_program::ID @ AttentionError::InvalidTreasury)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let global = &mut ctx.accounts.global;
    global.authority = ctx.accounts.authority.key();
    global.treasury = ctx.accounts.treasury.key();
    global.fee_bps = DEFAULT_FEE_BPS;
    global.creator_fee_share_bps = DEFAULT_CREATOR_FEE_SHARE_BPS;
    global.graduation_sol = DEFAULT_GRADUATION_SOL;
    global.virtual_token_reserves = DEFAULT_VIRTUAL_TOKEN_RESERVES;
    global.token_total_supply = TOKEN_TOTAL_SUPPLY;
    global.token_decimals = TOKEN_DECIMALS;
    global.tokens_launched = 0;
    global.bump = ctx.bumps.global;

    let fee_config = &mut ctx.accounts.fee_config;
    fee_config.nft_fee_bps = DEFAULT_NFT_FEE_BPS;
    fee_config.promo_lamports_per_day = PROMO_LAMPORTS_PER_DAY;
    fee_config.bump = ctx.bumps.fee_config;
    Ok(())
}
