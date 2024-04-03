library;

abi Bridge {
    /// Claim a refund for incorrectly bridged tokens if one has been registered.
    ///
    /// # Arguments
    ///
    /// * `from`: [b256] - the depositor's address entitled to a refund
    /// * `token_address`: [b256] - the token address to be refunded back to the depositor
    /// * `token_id`: [b256] - the token id to be refunded back to the depositor
    #[storage(read, write)]
    fn claim_refund(from: b256, token_address: b256, token_id: b256);

    /// Withdraw coins back to the base layer and burn the corresponding proxy coins.
    ///
    /// # Arguments
    ///
    /// * `to`: [b256] - the address which is the destination of the transfer
    ///
    /// # Reverts
    ///
    /// * When no coins were sent with call
    /// * When the wrong asset was sent with the call
    /// * When the amount sent overflows/underflows during decimal conversion
    #[payable]
    #[storage(read, write)]
    fn withdraw(to: b256);

    /// Get the address of the gateway that holds the bridged tokens
    fn bridged_token_gateway() -> b256;

    // Recovers the sub_id used to generate an asset_id (= sha256(contract_id, sub_id))
    #[storage(read)]
    fn asset_to_sub_id(asset_id: AssetId) -> SubId;

    #[storage(read)]
    fn asset_to_l1_address(asset_id: AssetId) -> b256;

    #[storage(read)]
    fn asset_to_l1_decimals(asset_id: AssetId) -> u8;
}
