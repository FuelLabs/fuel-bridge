library;

abi MessageReceiver {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u8);
}
