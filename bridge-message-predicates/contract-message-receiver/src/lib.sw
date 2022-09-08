library message_receiver;

abi MessageReceiver {
    #[storage(read, write)]fn process_message(msg_idx: u8);
}
