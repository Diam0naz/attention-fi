//! Token metadata — the account a wallet reads to learn a token's name.
//!
//! Without one, every launched token shows as a bare mint address in Phantom,
//! Solflare and every explorer, no matter what its creator typed at launch:
//! that name lived only in our off-chain registry, which no wallet has heard
//! of.
//!
//! The ordering here is the whole point. `CreateMetadataAccountV3` requires the
//! mint authority to sign, and every launch instruction ends by revoking it to
//! fix the supply. Metadata must therefore be created *before* that revoke, in
//! the same instruction — once the authority is `None` no metadata account can
//! ever exist for that mint, and no later instruction, migration or backfill
//! can change it. Tokens launched before this shipped are permanently nameless.

use anchor_lang::prelude::*;
use anchor_spl::metadata::mpl_token_metadata::types::DataV2;
use anchor_spl::metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3};

use crate::error::AttentionError;

/// Metaplex's own limits. Exceeding them fails inside the CPI with an error
/// that says nothing about which field was too long, so they're checked here.
const MAX_NAME_LEN: usize = 32;
const MAX_SYMBOL_LEN: usize = 10;
const MAX_URI_LEN: usize = 200;

/// A launched token's name, symbol and metadata URI.
///
/// One argument rather than three loose strings: they are meaningless apart,
/// every launch instruction needs all of them, and passing them separately put
/// two of those instructions over clippy's argument limit. Grouping also means
/// a future field arrives without changing five signatures again.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TokenMetadataArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

/// Accounts every launch instruction must supply for the metadata CPI.
pub struct MetadataCpi<'info> {
    pub metadata: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    /// Signs as mint authority — the curve/auction PDA, before the revoke.
    pub mint_authority: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub update_authority: AccountInfo<'info>,
    pub token_metadata_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub rent: AccountInfo<'info>,
}

/// Create a launched token's metadata account.
///
/// Written immutable (`is_mutable = false`). A token's name, symbol and image
/// are what people trade on, and a mutable record lets a dead token be renamed
/// into an impersonation of a live one after buyers have already committed.
/// Immutability is the same promise as the fixed supply, applied to identity
/// instead of quantity: what you bought stays what you bought.
///
/// `seller_fee_basis_points` is zero and `creators` is None — those fields are
/// an NFT royalty mechanism and mean nothing for a fungible token.
pub fn create_token_metadata(
    accounts: MetadataCpi<'_>,
    signer_seeds: &[&[&[u8]]],
    args: TokenMetadataArgs,
) -> Result<()> {
    let TokenMetadataArgs { name, symbol, uri } = args;
    require!(
        !name.is_empty() && name.len() <= MAX_NAME_LEN,
        AttentionError::InvalidTokenMetadata
    );
    require!(
        !symbol.is_empty() && symbol.len() <= MAX_SYMBOL_LEN,
        AttentionError::InvalidTokenMetadata
    );
    require!(
        uri.len() <= MAX_URI_LEN,
        AttentionError::InvalidTokenMetadata
    );

    let program = accounts.token_metadata_program.clone();
    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            program,
            CreateMetadataAccountsV3 {
                metadata: accounts.metadata,
                mint: accounts.mint,
                mint_authority: accounts.mint_authority,
                payer: accounts.payer,
                update_authority: accounts.update_authority,
                system_program: accounts.system_program,
                rent: accounts.rent,
            },
            signer_seeds,
        ),
        DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        false,
        // The update authority is a PDA and cannot sign here; it doesn't need
        // to, since the record is immutable and will never be updated.
        false,
        None,
    )
}
