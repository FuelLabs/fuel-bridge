library;

use std::vm::evm::evm_address::EvmAddress;

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
    #[storage(read, write)]
    #[payable]
    fn withdraw(to: b256);

    /// Get the bridged token
    fn bridged_token() -> b256;

    /// Get the bridged token decimals
    fn bridged_token_decimals() -> u8;

    /// Get the address of the gateway that holds the bridged tokens
    fn bridged_token_gateway() -> b256;
}
