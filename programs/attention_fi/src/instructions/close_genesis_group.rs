use anchor_lang::prelude::*;
use mpl_core::instructions::UpdateCollectionV1CpiBuilder;

use crate::constants::GENGROUP_SEED;
use crate::error::AttentionError;
use crate::events::GenesisGroupClosedEvent;
use crate::state::GenesisGroup;

/// Delist a genesis group and give the creator their collection back.
///
/// Closing is what stops the run: `buy_genesis_unit` reads the group account,
/// so once it is gone there is nothing left to buy from. The collection's
/// update authority — escrowed at listing so the declared size could not be
/// inflated after the fact — returns to the creator, and the group's rent goes
/// with it.
///
/// Requires the escrow to be empty. Handing the collection back while it still
/// holds unsold units would leave those units owned by a PDA whose account no
/// longer exists, which is the exact stranding this whole path was added to
/// prevent — `reclaim_genesis_units` first, then this.
///
/// Units already sold are untouched and stay valid. They remain members of the
/// collection and their `GenesisNft` records keep earning; what the buyer owns
/// is the asset and the claim, neither of which the collection's authority can
/// take away. It can still rewrite a member's name and art, which is true of
/// any mpl-core collection and worth knowing before listing one.
#[derive(Accounts)]
pub struct CloseGenesisGroup<'info> {
    /// The group's creator; receives the collection authority and the rent.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: bound by the group's `has_one`; only used to derive its PDA.
    pub subject_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [GENGROUP_SEED, subject_mint.key().as_ref()],
        bump = group.bump,
        has_one = subject_mint,
        has_one = creator @ AttentionError::Unauthorized,
        has_one = collection,
        close = creator,
    )]
    pub group: Account<'info, GenesisGroup>,

    /// CHECK: the group's collection; bound by `group.has_one = collection`.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn close_genesis_group_handler(ctx: Context<CloseGenesisGroup>) -> Result<()> {
    let group = &ctx.accounts.group;
    require!(
        group.minted_units == group.sold_units,
        AttentionError::GenesisUnitsInEscrow
    );

    let subject_mint = ctx.accounts.subject_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[GENGROUP_SEED, subject_mint.as_ref(), &[group.bump]]];

    // Signed by the group while it still exists — Anchor's `close` runs after
    // this handler returns, so the PDA is still a valid authority here.
    UpdateCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.creator.to_account_info())
        .authority(Some(&ctx.accounts.group.to_account_info()))
        .new_update_authority(Some(&ctx.accounts.creator.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .invoke_signed(signer_seeds)?;

    emit!(GenesisGroupClosedEvent {
        subject_mint,
        creator: ctx.accounts.creator.key(),
        collection: ctx.accounts.collection.key(),
        sold_units: group.sold_units,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
