contract;

use contract_message_receiver::MessageReceiver;
use std::inputs::input_message_data_length;

impl MessageReceiver for Contract {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u8) {
        assert(input_message_data_length(msg_idx) > 161);
    }
}
