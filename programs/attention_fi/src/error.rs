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
}
