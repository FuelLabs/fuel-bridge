library bridge_fungible_token_abi;

use std::vm::evm::evm_address::EvmAddress;

abi BridgeFungibleToken {
    /// Claim a refund for an address if one has been registered.
    ///
    /// # Arguments
    ///
    /// * `originator` - the address entitled to a refund
    /// * `asset` - the L1 token to be refunded back to the originator
    #[storage(read, write)]
    fn claim_refund(originator: b256, asset: b256);

    /// Withdraw coins back to L1 and burn the corresponding amount of coins
    /// on L2.
    ///
    /// # Arguments
    ///
    /// * `to` - the address which is the destination of the transfer
    ///
    /// # Reverts
    ///
    /// * When no coins were sent with call
    /// * When the wrong asset was sent with the call
    #[payable]
    fn withdraw_to(to: b256);

    /// Get the name of this token contract
    fn name() -> str[32];

    /// Get the symbol of this token contract
    fn symbol() -> str[32];

    /// Get the decimals of this token contract
    fn decimals() -> u8;

    /// Get the L1 token that this contract bridges
    fn layer1_token() -> b256;

    /// Get the L1 decimals of this token contract
    fn layer1_decimals() -> u8;

    /// Get the Address of the L1 erc20 gateway used by this contract
    fn layer1_erc20_gateway() -> b256;
}
