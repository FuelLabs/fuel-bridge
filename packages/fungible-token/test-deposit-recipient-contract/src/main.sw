contract;

use contract_message_receiver::MessageReceiver;
use std::inputs::input_message_data_length;

impl MessageReceiver for Contract {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u64) {
        assert(input_message_data_length(msg_idx).unwrap() > 193);
    }
}
