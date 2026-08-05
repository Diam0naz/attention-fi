use anchor_lang::prelude::*;
use mpl_core::instructions::BurnV1CpiBuilder;

/// Destroy a Core asset the caller owns, returning its rent.
///
/// mpl-core does the authorisation: it requires `authority` to be the asset's
/// owner or an approved delegate, and refuses anything carrying a permanent
/// freeze delegate. That covers the credentials without a check here — perk
/// and verification NFTs are frozen at mint precisely so they can't be moved
/// or destroyed, and a soulbound badge that could be burned away would defeat
/// the point of binding it.
///
/// Deliberately no program-side record. Nothing in AttentionFi keys off an
/// asset existing except the PDAs that describe perks and genesis positions,
/// and neither of those is burnable — a genesis NFT is a claim on a fee
/// stream, so it leaves through a sale, not a bin.
#[derive(Accounts)]
pub struct BurnNft<'info> {
    /// Owner of the asset, and the account rent is returned to.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: the Core asset to burn; mpl-core validates ownership.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: the collection the asset belongs to, if any. Required when it
    /// has one — Core decrements the collection's size as part of the burn.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Metaplex Core program, validated by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn burn_nft_handler(ctx: Context<BurnNft>) -> Result<()> {
    let owner = ctx.accounts.owner.to_account_info();
    let asset = ctx.accounts.asset.to_account_info();
    let collection = ctx
        .accounts
        .collection
        .as_ref()
        .map(|c| c.to_account_info());

    BurnV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&asset)
        .collection(collection.as_ref())
        .payer(&owner)
        .authority(Some(&owner))
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke()?;

    Ok(())
}
