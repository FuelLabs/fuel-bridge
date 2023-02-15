library contract_message_receiver_abi;

abi MessageReceiver {
    /// Process a message passed to the receiver contract to facilitate a deposit of bridged tokens.
    ///
    /// # Arguments
    ///
    /// * `msg_idx` - the index of the InputMessage to process
    ///
    /// # Reverts
    ///
    /// * When the sender is not the LAYER_1_ERC20_GATEWAY
    #[storage(read, write)]
    #[payable]
    fn process_message(msg_idx: u8);
}
