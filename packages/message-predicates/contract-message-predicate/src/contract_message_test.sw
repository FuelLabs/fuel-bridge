contract;

use contract_message_receiver::MessageReceiver;
use std::bytes::Bytes;
use std::inputs::{input_message_data, input_message_data_length};

storage {
    counter: u64 = 0,
    data1: ContractId = ContractId::from(b256::zero()),
    data2: u64 = 0,
    data3: b256 = b256::zero(),
    data4: Address = Address::from(b256::zero()),
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
// TODO: remove once an [into(self) -> u64] is added for the Bytes type
fn into_u64(b: Bytes) -> u64 {
    asm(ptr: b.ptr(), r0) {
        lw r0 ptr i0;
        r0: u64
    }
}

// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[storage(read, write)]
    #[payable]
    fn process_message(msg_idx: u64) {
        storage.counter.write(0); // Temporary fix for: https://github.com/FuelLabs/sway/issues/4634
        storage.counter.write(storage.counter.read() + 1);

        // Parse the message data
        let data_length = input_message_data_length(msg_idx).unwrap();
        if (data_length >= 32u64) {
            let contract_id: b256 = input_message_data(msg_idx, 0).unwrap().into();
            storage.data1.write(ContractId::from(contract_id));
        }
        if (data_length >= 32u64 + 8u64) {
            let num: u64 = into_u64(input_message_data(msg_idx, 32).unwrap());
            storage.data2.write(num);
        }
        if (data_length >= 32u64 + 8u64 + 32u64) {
            let big_num: b256 = input_message_data(msg_idx, 32 + 8).unwrap().into();
            storage.data3.write(big_num);
        }
        if (data_length >= 32u64 + 8u64 + 32u64 + 32u64) {
            let address: b256 = input_message_data(msg_idx, 32 + 8 + 32).unwrap().into();
            storage.data4.write(Address::from(address));
        }
    }
}

// Implement simple getters for testing purposes
impl VerifyMessageData for Contract {
    #[storage(read)]
    fn test_counter() -> u64 {
        storage.counter.read()
    }

    #[storage(read)]
    fn test_data1() -> ContractId {
        storage.data1.read()
    }

    #[storage(read)]
    fn test_data2() -> u64 {
        storage.data2.read()
    }

    #[storage(read)]
    fn test_data3() -> b256 {
        storage.data3.read()
    }

    #[storage(read)]
    fn test_data4() -> Address {
        storage.data4.read()
    }
}
