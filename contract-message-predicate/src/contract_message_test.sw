contract;

use contract_message_receiver::MessageReceiver;
use std::bytes::Bytes;
use std::constants::ZERO_B256;
use std::inputs::{input_message_data, input_message_data_length};

storage {
    counter: u64 = 0,
    data1: ContractId = ContractId::from(ZERO_B256),
    data2: u64 = 0,
    data3: b256 = ZERO_B256,
    data4: Address = Address::from(ZERO_B256),
}

// Define verification abi
abi VerifyMessageData {
    #[storage(read)]
    fn test_counter() -> u64;
    #[storage(read)]
    fn test_data1() -> ContractId;
    #[storage(read)]
    fn test_data2() -> u64;
    #[storage(read)]
    fn test_data3() -> b256;
    #[storage(read)]
    fn test_data4() -> Address;
}

// Converts a Bytes type to u64
//TODO: remove once an [into(self) -> u64] is added for the Bytes type
fn into_u64(b: Bytes) -> u64 {
    asm(ptr: b.buf.ptr, r0) {
        lw   r0 ptr i0;
        r0: u64
    }
}

// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[storage(read, write)]
    #[payable]
    fn process_message(msg_idx: u8) {
        storage.counter = storage.counter + 1;

        // Parse the message data
        let data_length = input_message_data_length(msg_idx);
        if (data_length >= 32u16) {
            let contract_id: b256 = input_message_data(msg_idx, 0).into();
            storage.data1 = ContractId::from(contract_id);
        }
        if (data_length >= 32u16 + 8u16) {
            let num: u64 = into_u64(input_message_data(msg_idx, 32));
            storage.data2 = num;
        }
        if (data_length >= 32u16 + 8u16 + 32u16) {
            let big_num: b256 = input_message_data(msg_idx, 32 + 8).into();
            storage.data3 = big_num;
        }
        if (data_length >= 32u16 + 8u16 + 32u16 + 32u16) {
            let address: b256 = input_message_data(msg_idx, 32 + 8 + 32).into();
            storage.data4 = Address::from(address);
        }
    }
}

// Implement simple getters for testing purposes
impl VerifyMessageData for Contract {
    #[storage(read)]
    fn test_counter() -> u64 {
        storage.counter
    }
    #[storage(read)]
    fn test_data1() -> ContractId {
        storage.data1
    }
    #[storage(read)]
    fn test_data2() -> u64 {
        storage.data2
    }
    #[storage(read)]
    fn test_data3() -> b256 {
        storage.data3
    }
    #[storage(read)]
    fn test_data4() -> Address {
        storage.data4
    }
}
