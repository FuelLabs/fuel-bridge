library;

abi MessageReceiver {
    #[storage(read, write)]
    #[payable]
    fn process_message(msg_idx: u8);
}
