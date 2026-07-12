use anchor_lang::prelude::*;

use crate::constants::{
    DEFAULT_CREATOR_FEE_SHARE_BPS, DEFAULT_FEE_BPS, DEFAULT_GRADUATION_SOL,
    DEFAULT_VIRTUAL_TOKEN_RESERVES, GLOBAL_SEED, TOKEN_DECIMALS, TOKEN_TOTAL_SUPPLY,
};
use crate::error::AttentionError;
use crate::state::Global;

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
    Ok(())
}
