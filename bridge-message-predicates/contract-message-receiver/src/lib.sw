library contract_message_receiver_abi;

abi MessageReceiver {
    #[storage(read, write)]
    #[payable]
    fn process_message(msg_idx: u8);
}
