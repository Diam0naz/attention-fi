use anchor_lang::prelude::*;

#[error_code]
pub enum AttentionError {
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Bonding curve has already graduated")]
    CurveComplete,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient reserves in the bonding curve")]
    InsufficientReserves,
    #[msg("Invalid auction parameters")]
    InvalidAuctionParams,
    #[msg("Auction has already ended")]
    AuctionEnded,
    #[msg("Auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Auction allocation is sold out")]
    SoldOut,
    #[msg("That collection is listed for sale — withdraw it before listing a member separately")]
    CollectionListed,
    #[msg("Current price exceeds the bidder's maximum")]
    PriceAboveMax,
    #[msg("Position holds fewer tokens than requested")]
    InsufficientPosition,
    #[msg("No shares staked to receive the deposit")]
    NoStakers,
    #[msg("Not enough shares remain for sale")]
    InsufficientShares,
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("Handle is empty or too long")]
    InvalidHandle,
    #[msg("Perk is already at max level")]
    MaxLevelReached,
    #[msg("Attestation account is invalid or malformed")]
    InvalidAttestation,
    #[msg("Attestation has expired")]
    AttestationExpired,
    #[msg("Treasury must be a System-owned account")]
    InvalidTreasury,
    #[msg("Invalid or unparseable Switchboard feed")]
    InvalidFeed,
    #[msg("Switchboard feed is stale or has too few samples")]
    StaleFeed,
    #[msg("No creator fees available to claim")]
    NoCreatorFees,
    #[msg("Curve has not reached the graduation threshold")]
    NotReadyToGraduate,
    #[msg("Not enough trading volume or deposits to reach the next perk level")]
    InsufficientActivity,
    #[msg("Perk level must be between 1 and MAX_PERK_LEVEL")]
    InvalidPerkLevel,
    // Appended, never inserted: an #[error_code] variant's position *is* its
    // on-chain code, so adding one in the middle silently renumbers every
    // variant below it and every client that reports errors by number.
    #[msg("Token name, symbol or URI is empty or exceeds the Metaplex limit")]
    InvalidTokenMetadata,
    #[msg("Genesis group size, share, price or per-wallet cap is invalid")]
    InvalidGenesisGroup,
    #[msg("Genesis group already holds every unit it declared")]
    GenesisGroupFull,
    #[msg("Genesis batch is empty or exceeds the per-call limit")]
    InvalidGenesisBatch,
    #[msg("Wallet already holds its maximum units of this genesis group")]
    WalletCapReached,
    #[msg("That asset is not a unit of this genesis group")]
    AssetNotInGroup,
    #[msg("Config value is outside the range the protocol accepts")]
    InvalidConfig,
    #[msg("No unsold units left in the group's escrow to reclaim")]
    NoUnitsToReclaim,
    #[msg("Reclaim the group's unsold units before closing it")]
    GenesisUnitsInEscrow,
    #[msg("That would commit more than 100% of the token's fee stream")]
    ShareOversubscribed,
    #[msg("This token has genesis holders — its fee pool must be supplied")]
    GenesisPoolRequired,
    #[msg("Total cost exceeds the maximum the caller authorised")]
    CostAboveMax,
    #[msg("That account is not a Metaplex Core asset")]
    InvalidAsset,
}
