library;

pub enum BridgeFungibleTokenError {
    UnauthorizedSender: (),
    IncorrectAssetDeposited: (),
    NoCoinsSent: (),
    NoRefundAvailable: (),
    OverflowError: (),
    UnderflowError: (),
}
