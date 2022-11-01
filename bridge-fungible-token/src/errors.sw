library errors;

pub enum BridgeFungibleTokenError {
    UnauthorizedSender: (),
    IncorrectAssetDeposited: (),
    NoCoinsForwarded: (),
    NoRefundAvailable: (),
    BridgedValueIncompatability: (),
}
