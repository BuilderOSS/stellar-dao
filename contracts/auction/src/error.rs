use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    /// Bid placed for incorrect token ID
    InvalidTokenId = 1,
    /// Bid placed after auction ended
    AuctionOver = 2,
    /// Auction hasn't started yet
    AuctionNotStarted = 3,
    /// Attempting to settle an active auction
    AuctionActive = 4,
    /// Auction already settled
    AuctionSettled = 5,
    /// First bid doesn't meet reserve price
    ReservePriceNotMet = 6,
    /// Bid doesn't meet minimum increment
    MinBidNotMet = 7,
    /// Invalid configuration parameters
    InvalidConfig = 8,
    /// Token minting failed
    MintFailed = 9,
    /// Token or payment transfer failed
    TransferFailed = 10,
    /// Payment token not configured for SAC bids
    NoPaymentTokenSet = 11,
    /// Auction not launched yet
    NotLaunched = 12,
    /// Cannot create new auction
    CannotCreateAuction = 13,
}
