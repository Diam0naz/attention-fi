use anchor_lang::prelude::*;
use anchor_lang::system_program;
use mpl_core::accounts::BaseAssetV1;
use mpl_core::instructions::TransferV1CpiBuilder;
// `Key` is referenced by its full path below: mpl-core's asset-kind enum shares
// a name with Anchor's `Key` trait, and importing it here takes `.key()` away
// from every account in this file.
use mpl_core::types::UpdateAuthority;

use crate::constants::{
    FEECONFIG_SEED, GENALLOC_SEED, GENESIS_SEED, GENGROUP_SEED, GENPOOL_SEED, GLOBAL_SEED,
    GUARDIANS_SEED,
};
use crate::error::AttentionError;
use crate::events::GenesisUnitSoldEvent;
use crate::genesis::{record_allocation, record_sale};
use crate::guardians;
use crate::revenue::accrued;
use crate::state::{FeeConfig, GenesisAllocation, GenesisGroup, GenesisNft, GenesisPool, Global};

/// Take one unit out of a token's genesis group at the listed price.
///
/// The buyer picks which unit — they are interchangeable in what they earn, but
/// each is its own asset with its own number, and letting the caller name it
/// keeps the program out of the business of choosing. Anything not actually part
/// of the group is rejected: the unit must be owned by the group's escrow and
/// belong to the group's collection, so an asset someone sent to the escrow
/// themselves can't be laundered into a claim on the creator's fee stream.
///
/// The `GenesisNft` record — the thing that actually earns — is created here
/// rather than at mint time, and its `reward_debt` snapshots the pool's
/// accumulator at this moment. An unsold unit sitting in escrow therefore never
/// accrues, and a buyer never inherits fees that were deposited before they
/// arrived. It also means the buyer pays that account's rent, which is the
/// account they own.
#[derive(Accounts)]
pub struct BuyGenesisUnit<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,

    /// A genesis unit is an NFT sale, so it is charged the NFT market's fee.
    #[account(seeds = [FEECONFIG_SEED], bump = fee_config.bump)]
    pub fee_config: Account<'info, FeeConfig>,

    /// CHECK: must equal the treasury recorded in Global.
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: seller receiving the proceeds; bound by `group.has_one = creator`.
    #[account(mut, address = group.creator)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: bound by the group's `has_one`; keys the group, pool and allocation.
    pub subject_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [GENGROUP_SEED, subject_mint.key().as_ref()],
        bump = group.bump,
        has_one = subject_mint,
        has_one = collection,
    )]
    pub group: Account<'info, GenesisGroup>,

    /// CHECK: the group's collection; bound by `group.has_one = collection`.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: the unit being bought. Verified in the handler to be owned by the
    /// group's escrow and a member of its collection.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        init,
        payer = buyer,
        space = 8 + GenesisNft::INIT_SPACE,
        seeds = [GENESIS_SEED, asset.key().as_ref()],
        bump,
    )]
    pub genesis: Account<'info, GenesisNft>,

    /// Created by `list_genesis_group`, so it always exists by the time a unit
    /// can be bought.
    #[account(
        mut,
        seeds = [GENPOOL_SEED, subject_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, GenesisPool>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + GenesisAllocation::INIT_SPACE,
        seeds = [GENALLOC_SEED, subject_mint.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub allocation: Account<'info, GenesisAllocation>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

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
}

pub fn buy_genesis_unit_handler(ctx: Context<BuyGenesisUnit>, max_total: u64) -> Result<()> {
    // Refuses while a guardian has pulled the stop.
    guardians::require_live(&ctx.accounts.guardians.to_account_info())?;

    let price = ctx.accounts.group.price;

    let sold_units = record_sale(
        ctx.accounts.group.sold_units,
        ctx.accounts.group.minted_units,
    )?;
    let units = record_allocation(
        ctx.accounts.allocation.units,
        ctx.accounts.group.per_wallet_cap,
    )?;

    // Prove the asset is a unit of this group before any lamports move.
    //
    // Ownership alone would nearly do it — only `mint_genesis_batch` mints into
    // the escrow — but nothing stops an outsider transferring an asset of their
    // own to the group PDA, and buying that back would mint them a `GenesisNft`
    // against the creator's fee stream for an asset the creator never issued.
    // Collection membership is what ties the asset to this run, and the
    // collection's authority is escrowed, so it cannot be forged after listing.
    let group_key = ctx.accounts.group.key();
    let asset_record = {
        let data = ctx.accounts.asset.try_borrow_data()?;
        BaseAssetV1::from_bytes(&data).map_err(|_| AttentionError::AssetNotInGroup)?
    };
    require!(
        asset_record.key == mpl_core::types::Key::AssetV1,
        AttentionError::AssetNotInGroup
    );
    require!(
        asset_record.owner == group_key,
        AttentionError::AssetNotInGroup
    );
    let UpdateAuthority::Collection(asset_collection) = asset_record.update_authority else {
        return err!(AttentionError::AssetNotInGroup);
    };
    require!(
        asset_collection == ctx.accounts.group.collection,
        AttentionError::AssetNotInGroup
    );

    let fee = u128::from(price)
        .checked_mul(u128::from(ctx.accounts.fee_config.nft_fee_bps))
        .and_then(|product| product.checked_div(10_000))
        .ok_or(AttentionError::MathOverflow)?;
    let fee = u64::try_from(fee).map_err(|_| AttentionError::MathOverflow)?;
    // The ceiling covers what actually leaves the buyer's wallet. The fee is
    // charged on top of the price and its rate is tunable between signing and
    // landing, so a guard on the price alone bounded the wrong number — the
    // buyer authorised one figure and could be debited a larger one.
    let total = price.checked_add(fee).ok_or(AttentionError::MathOverflow)?;
    require!(total <= max_total, AttentionError::CostAboveMax);

    // Buyer -> creator (price), buyer -> treasury (fee on top).
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.creator.to_account_info(),
            },
        ),
        price,
    )?;
    if fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let subject_mint = ctx.accounts.subject_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        GENGROUP_SEED,
        subject_mint.as_ref(),
        &[ctx.accounts.group.bump],
    ]];

    // Hand the unit over; the group PDA signs as its owner. The collection
    // travels with the call because Core validates a member's transfer against
    // the collection it names as its update authority.
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.buyer.to_account_info())
        .authority(Some(&ctx.accounts.group.to_account_info()))
        .new_owner(&ctx.accounts.buyer.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer_seeds)?;

    let share_bps = ctx.accounts.group.share_bps;
    let acc = ctx.accounts.pool.acc_per_share;

    let genesis = &mut ctx.accounts.genesis;
    genesis.asset = ctx.accounts.asset.key();
    genesis.owner = ctx.accounts.buyer.key();
    genesis.subject_mint = subject_mint;
    genesis.share_bps = share_bps;
    genesis.reward_debt = accrued(u64::from(share_bps), acc)?;
    genesis.unclaimed = 0;
    genesis.bump = ctx.bumps.genesis;

    // The stream is only diluted as units actually sell, so unsold inventory
    // never costs existing holders anything.
    let pool = &mut ctx.accounts.pool;
    pool.total_share_bps = pool
        .total_share_bps
        .checked_add(u64::from(share_bps))
        .ok_or(AttentionError::MathOverflow)?;

    let allocation = &mut ctx.accounts.allocation;
    allocation.subject_mint = subject_mint;
    allocation.buyer = ctx.accounts.buyer.key();
    allocation.units = units;
    allocation.bump = ctx.bumps.allocation;

    ctx.accounts.group.sold_units = sold_units;

    emit!(GenesisUnitSoldEvent {
        subject_mint,
        asset: ctx.accounts.asset.key(),
        buyer: ctx.accounts.buyer.key(),
        price,
        fee,
        share_bps,
        sold_units,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
