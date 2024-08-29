library;

pub enum BridgeFungibleTokenError {
    UnauthorizedSender: (),
    NoCoinsSent: (),
    NoRefundAvailable: (),
    AssetNotFound: (),
    WithdrawalToZeroAddress: (),
}
