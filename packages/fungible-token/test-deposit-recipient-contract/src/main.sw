contract;

use contract_message_receiver::MessageReceiver;
use std::inputs::input_message_data_length;

storage {
    val: bool = false,
}

abi DepositRecipient {
    #[storage(read)]
    fn get_stored_val() -> bool;
}

impl MessageReceiver for Contract {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u8) {
        assert(input_message_data_length(msg_idx) > 161);
    }
}

impl DepositRecipient for Contract {
    #[storage(read)]
    fn get_stored_val() -> bool {
        storage.val.read()
    }
}
