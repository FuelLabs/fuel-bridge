contract;

dep contract_message_test_abi;
dep transaction_utils;

use contract_message_receiver::MessageReceiver;
use contract_message_test_abi::VerifyMessageData;
use transaction_utils::{input_message_data, input_message_data_length};
use std::constants::ZERO_B256;

storage {
    counter: u64 = 0,
    data1: ContractId = ContractId::from(ZERO_B256),
    data2: u64 = 0,
    data3: b256 = ZERO_B256,
    data4: Address = Address::from(ZERO_B256),
}

// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[storage(read, write)]
    fn process_message(msg_idx: u8) {
        storage.counter = storage.counter + 1;

        // Parse the message data
        let data_length = input_message_data_length(msg_idx);
        if (data_length >= 32) {
            let contract_id: b256 = input_message_data(msg_idx, 0);
            storage.data1 = ContractId::from(contract_id);
        }
        if (data_length >= 32 + 8) {
            let num: u64 = input_message_data(msg_idx, 32);
            storage.data2 = num;
        }
        if (data_length >= 32 + 8 + 32) {
            let big_num: b256 = input_message_data(msg_idx, 32 + 8);
            storage.data3 = big_num;
        }
        if (data_length >= 32 + 8 + 32 + 32) {
            let address: b256 = input_message_data(msg_idx, 32 + 8 + 32);
            storage.data4 = Address::from(address);
        }
    }
}

// Implement simple getters for testing purposes
impl VerifyMessageData for Contract {
    #[storage(read)]
    fn get_test_counter() -> u64 {
        storage.counter
    }
    #[storage(read)]
    fn get_test_data1() -> ContractId {
        storage.data1
    }
    #[storage(read)]
    fn get_test_data2() -> u64 {
        storage.data2
    }
    #[storage(read)]
    fn get_test_data3() -> b256 {
        storage.data3
    }
    #[storage(read)]
    fn get_test_data4() -> Address {
        storage.data4
    }
}
