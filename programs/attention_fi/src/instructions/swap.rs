use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::amm::swap_quote;
use crate::constants::{AMM_SEED, CURVE_SEED, GENPOOL_SEED, GLOBAL_SEED, PERK_SEED};
use crate::curve::{mul_div, split_creator_fee};
use crate::error::AttentionError;
use crate::events::AmmSwapEvent;
use crate::nft::{discounted_fee_bps, perk_discount_bps};
use crate::revenue::{acc_increment, split_genesis_fee};
use crate::state::{AmmPool, BondingCurve, GenesisPool, Global, PerkNft};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,

    #[account(
        mut,
        seeds = [AMM_SEED, mint.key().as_ref()],
        bump = pool.bump,
        has_one = mint,
    )]
    pub pool: Box<Account<'info, AmmPool>>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// The token's bonding curve, which outlives graduation as the ledger for
    /// creator fees. Routing the AMM's creator cut here means `claim_creator_fee`
    /// keeps working unchanged, and a creator has one balance rather than one
    /// per venue.
    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Box<Account<'info, BondingCurve>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = pool)]
    pub pool_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = trader,
        associated_token::mint = mint,
        associated_token::authority = trader,
    )]
    pub trader_token_account: Box<Account<'info, TokenAccount>>,

    /// Optional perk NFT owned by the trader; grants a trading-fee discount.
    /// Constrained to a perk PDA owned by the trader when supplied — same shape
    /// as Buy and Sell, because a perk that stops working the moment a token
    /// graduates is a benefit withdrawn exactly when it starts to matter.
    #[account(
        seeds = [PERK_SEED, perk.asset.as_ref()],
        bump = perk.bump,
        constraint = perk.owner == trader.key() @ AttentionError::Unauthorized,
    )]
    pub perk: Option<Box<Account<'info, PerkNft>>>,

    /// Optional genesis fee pool for this token. Supplied only when the token
    /// has genesis NFTs; absent means the creator keeps their whole cut.
    ///
    /// Optional rather than required because most tokens never mint genesis
    /// NFTs, and making every trade carry an account that usually does not
    /// exist would be a tax on the common case.
    #[account(
        mut,
        seeds = [GENPOOL_SEED, mint.key().as_ref()],
        bump = genesis_pool.bump,
    )]
    pub genesis_pool: Option<Box<Account<'info, GenesisPool>>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// Every Anchor account here is boxed. Swap carries the most accounts of any
// instruction in the program — pool, curve, treasury, two token accounts and
// two optional NFTs — and unboxed they put `try_accounts` over the BPF stack
// limit, which the toolchain reports as "overwrites values in the frame ... may
// cause undefined behavior". Boxing moves the deserialised bodies to the heap
// and leaves pointers on the stack.

/// Swap on the graduated AMM pool. `is_buy` = SOL in / tokens out; otherwise
/// tokens in / SOL out.
///
/// The fee is split exactly as the bonding curve splits it — half to the
/// creator, half to the protocol — and taken at the same point in the trade:
/// off the SOL going in on a buy, off the SOL coming out on a sell. It used to
/// be retained in the pool as liquidity, which meant a creator's fee stream
/// ended the moment their token graduated. That is precisely when a successful
/// token starts trading most, and it quietly broke the promise printed on every
/// genesis NFT ("a cut of every trade, forever"). Nothing about the economics
/// should change at the threshold; a trader shouldn't be able to tell which
/// venue filled them by looking at the fee.
///
/// Denominating the sell-side fee in SOL rather than tokens is deliberate. The
/// constant-product formula skims from whatever goes in, which on a sell is
/// tokens — and a fee paid in tokens would need a token account for the
/// treasury and the curve on every mint in existence. Pricing gross and
/// skimming the proceeds gives the same economics in one currency.
pub fn swap_handler(
    ctx: Context<Swap>,
    amount_in: u64,
    min_amount_out: u64,
    is_buy: bool,
) -> Result<()> {
    require!(amount_in > 0, AttentionError::ZeroAmount);

    // A perk discount now genuinely reduces what the creator and the treasury
    // collect, exactly as it does on the curve. While the fee stayed in the
    // pool it cost nobody anything, which made the perk cheaper to honour here
    // than it was pre-graduation — the same benefit quietly meaning two
    // different things either side of the threshold.
    let fee_bps = match &ctx.accounts.perk {
        Some(perk) => {
            discounted_fee_bps(ctx.accounts.global.fee_bps, perk_discount_bps(perk.level))
        }
        None => ctx.accounts.global.fee_bps,
    };
    let mint_key = ctx.accounts.mint.key();
    let trader_key = ctx.accounts.trader.key();
    let pool_bump = ctx.accounts.pool.bump;
    let (sol_reserves, token_reserves) = (
        ctx.accounts.pool.sol_reserves,
        ctx.accounts.pool.token_reserves,
    );

    let now = Clock::get()?.unix_timestamp;

    if is_buy {
        // Fee off the input first, then price the remainder — `buy_quote`'s
        // order. swap_quote is called with a zero fee because the skim is done
        // here explicitly; letting it take the fee would leave those lamports
        // in the pool, which is the behaviour being removed.
        let fee = mul_div(u128::from(amount_in), u128::from(fee_bps), 10_000)?;
        let fee = u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?;
        let sol_in = amount_in
            .checked_sub(fee)
            .ok_or(AttentionError::MathOverflow)?;

        let quote = swap_quote(sol_reserves, token_reserves, sol_in, 0)?;
        require!(quote.amount_out > 0, AttentionError::ZeroAmount);
        require!(
            quote.amount_out >= min_amount_out,
            AttentionError::SlippageExceeded
        );

        let (creator_cut, treasury_cut) =
            split_creator_fee(fee, ctx.accounts.global.creator_fee_share_bps)?;
        // The genesis holders' slice comes out of the creator's half, so the
        // treasury's share and the trader's cost are untouched by it.
        let total_share_bps = ctx
            .accounts
            .genesis_pool
            .as_ref()
            .map(|pool| pool.total_share_bps)
            .unwrap_or(0);
        let (genesis_cut, creator_cut) = split_genesis_fee(creator_cut, total_share_bps)?;

        // Trader -> pool (only what actually becomes liquidity).
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.trader.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            sol_in,
        )?;

        // Trader -> curve (creator accrual) and trader -> treasury, paid
        // directly rather than routed through the pool, so pool reserves never
        // transiently include lamports that aren't liquidity.
        if creator_cut > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.trader.to_account_info(),
                        to: ctx.accounts.curve.to_account_info(),
                    },
                ),
                creator_cut,
            )?;
        }
        if treasury_cut > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.trader.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                treasury_cut,
            )?;
        }
        if genesis_cut > 0 {
            if let Some(pool) = &ctx.accounts.genesis_pool {
                let increment = acc_increment(genesis_cut, pool.total_share_bps)?;
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.trader.to_account_info(),
                            to: pool.to_account_info(),
                        },
                    ),
                    genesis_cut,
                )?;
                let pool = ctx.accounts.genesis_pool.as_mut().unwrap();
                pool.acc_per_share = pool
                    .acc_per_share
                    .checked_add(increment)
                    .ok_or(AttentionError::MathOverflow)?;
                pool.reserves = pool
                    .reserves
                    .checked_add(genesis_cut)
                    .ok_or(AttentionError::MathOverflow)?;
            }
        }
        ctx.accounts.curve.creator_fees = ctx
            .accounts
            .curve
            .creator_fees
            .checked_add(creator_cut)
            .ok_or(AttentionError::MathOverflow)?;

        // Pool vault -> trader (tokens); pool PDA signs.
        let signer_seeds: &[&[&[u8]]] = &[&[AMM_SEED, mint_key.as_ref(), &[pool_bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            quote.amount_out,
        )?;

        let pool = &mut ctx.accounts.pool;
        pool.sol_reserves = pool
            .sol_reserves
            .checked_add(sol_in)
            .ok_or(AttentionError::MathOverflow)?;
        pool.token_reserves = pool
            .token_reserves
            .checked_sub(quote.amount_out)
            .ok_or(AttentionError::MathOverflow)?;

        emit!(AmmSwapEvent {
            mint: mint_key,
            trader: trader_key,
            is_buy: true,
            amount_in,
            amount_out: quote.amount_out,
            sol_reserves: pool.sol_reserves,
            token_reserves: pool.token_reserves,
            timestamp: now,
        });
    } else {
        // Price gross, then skim the proceeds — `sell_quote`'s order. The
        // trader's slippage floor is checked against what they actually
        // receive, not the pre-fee figure, so `min_amount_out` means the same
        // thing on both venues.
        let quote = swap_quote(token_reserves, sol_reserves, amount_in, 0)?;
        let gross = quote.amount_out;
        require!(gross > 0, AttentionError::ZeroAmount);
        require!(gross <= sol_reserves, AttentionError::InsufficientReserves);

        let fee = mul_div(u128::from(gross), u128::from(fee_bps), 10_000)?;
        let fee = u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?;
        let sol_out = gross.checked_sub(fee).ok_or(AttentionError::MathOverflow)?;
        require!(sol_out > 0, AttentionError::ZeroAmount);
        require!(sol_out >= min_amount_out, AttentionError::SlippageExceeded);

        let (creator_cut, treasury_cut) =
            split_creator_fee(fee, ctx.accounts.global.creator_fee_share_bps)?;
        // The genesis holders' slice comes out of the creator's half, so the
        // treasury's share and the trader's cost are untouched by it.
        let total_share_bps = ctx
            .accounts
            .genesis_pool
            .as_ref()
            .map(|pool| pool.total_share_bps)
            .unwrap_or(0);
        let (genesis_cut, creator_cut) = split_genesis_fee(creator_cut, total_share_bps)?;

        // Trader -> pool vault (tokens in).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // The whole gross amount leaves the pool: the net to the trader, and
        // the fee onward to the creator and the treasury. All three are
        // program-owned or plain accounts, so lamports move directly rather
        // than through a CPI the pool PDA would have to sign.
        **ctx
            .accounts
            .pool
            .to_account_info()
            .try_borrow_mut_lamports()? -= gross;
        **ctx
            .accounts
            .trader
            .to_account_info()
            .try_borrow_mut_lamports()? += sol_out;
        **ctx
            .accounts
            .curve
            .to_account_info()
            .try_borrow_mut_lamports()? += creator_cut;
        **ctx
            .accounts
            .treasury
            .to_account_info()
            .try_borrow_mut_lamports()? += treasury_cut;
        if genesis_cut > 0 {
            if let Some(pool) = &ctx.accounts.genesis_pool {
                let increment = acc_increment(genesis_cut, pool.total_share_bps)?;
                **pool.to_account_info().try_borrow_mut_lamports()? += genesis_cut;
                let pool = ctx.accounts.genesis_pool.as_mut().unwrap();
                pool.acc_per_share = pool
                    .acc_per_share
                    .checked_add(increment)
                    .ok_or(AttentionError::MathOverflow)?;
                pool.reserves = pool
                    .reserves
                    .checked_add(genesis_cut)
                    .ok_or(AttentionError::MathOverflow)?;
            }
        }

        ctx.accounts.curve.creator_fees = ctx
            .accounts
            .curve
            .creator_fees
            .checked_add(creator_cut)
            .ok_or(AttentionError::MathOverflow)?;

        let pool = &mut ctx.accounts.pool;
        pool.token_reserves = pool
            .token_reserves
            .checked_add(amount_in)
            .ok_or(AttentionError::MathOverflow)?;
        pool.sol_reserves = pool
            .sol_reserves
            .checked_sub(gross)
            .ok_or(AttentionError::MathOverflow)?;

        emit!(AmmSwapEvent {
            mint: mint_key,
            trader: trader_key,
            is_buy: false,
            amount_in,
            // What the trader received, net — the figure a client can check
            // against its own quote.
            amount_out: sol_out,
            sol_reserves: pool.sol_reserves,
            token_reserves: pool.token_reserves,
            timestamp: now,
        });
    }

    Ok(())
}
