contract;

use contract_message_receiver::L2ERC20Gateway;
use std::{address::Address, identity::Identity};

abi TestState {
    #[storage(read)]fn get_test_counter() -> u64;
}

storage {
    counter: u64 = 0,
}

impl L2ERC20Gateway for Contract {
    #[storage(read, write)]fn withdraw_refund(originator: Identity) {
    }
    fn withdraw_to(to: Identity) {
    }
    #[storage(read, write)]fn finalize_deposit() {
        storage.counter = storage.counter + 1;
    }
    fn layer1_token() -> Address {
        ~Address::from(0x0000000000000000000000000000000000000000000000000000000000000000)
    }
    fn layer1_decimals() -> u8 {
        18u8
    }
}

impl TestState for Contract {
    #[storage(read)]fn get_test_counter() -> u64 {
        storage.counter
    }
}
