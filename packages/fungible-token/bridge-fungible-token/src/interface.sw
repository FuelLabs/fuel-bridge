library;

use std::{u256::U256, vm::evm::evm_address::EvmAddress};

abi FRC20 {
    /// Get the total supply of the token.
    #[storage(read)]
    fn total_supply() -> U256;

    /// Get the name of the token
    /// Example (with trailing padding): "MY_TOKEN                                                        "
    fn name() -> str[64];

    /// Get the symbol of the token
    /// Example (with trailing padding): "TKN                             "
    fn symbol() -> str[32];

    /// Get the decimals of the token
    fn decimals() -> u8;
}

abi FungibleBridge {
    /// Claim a refund for incorrectly bridged tokens if one has been registered.
    ///
    /// # Arguments
    ///
    /// * `originator` - the address entitled to a refund
    /// * `asset` - the token to be refunded back to the originator
    #[storage(read, write)]
    fn claim_refund(originator: b256, asset: b256);

    /// Withdraw coins back to the base layer and burn the corresponding proxy coins.
    ///
    /// # Arguments
    ///
    /// * `to` - the address which is the destination of the transfer
    ///
    /// # Reverts
    ///
    /// * When no coins were sent with call
    /// * When the wrong asset was sent with the call
    /// * When the amount sent overflows/underflows during decimal conversion
    #[payable]
    #[storage(read, write)]
    fn withdraw(to: b256);

    /// Get the bridged token
    fn bridged_token() -> b256;

    /// Get the bridged token decimals
    fn bridged_token_decimals() -> u8;

    /// Get the address of the gateway that holds the bridged tokens
    fn bridged_token_gateway() -> b256;
}
