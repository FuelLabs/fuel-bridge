contract;

use std::address::Address;
use std::context::msg_amount;
use std::call_frames::msg_asset_id;
use std::asset::transfer_to_address;
use std::constants::ZERO_B256;

abi Wallet {
    #[storage(read, write), payable]
    fn receive_funds();

    #[storage(read, write)]
    fn send_funds(amount_to_send: u64, recipient_address: Address);
}

configurable {
    ASSET_ID: AssetId = AssetId::from(ZERO_B256),
    OWNER_ADDRESS: Address = Address::from(ZERO_B256)
}

storage {
    balance: u64 = 0,
}

impl Wallet for Contract {
    #[storage(read, write), payable]
    fn receive_funds() {
        if msg_asset_id() == ASSET_ID {
            // If we received `ASSET_ID` then keep track of the balance.
            // Otherwise, we're receiving other native assets and don't care
            // about our balance of tokens.
            storage.balance.write(storage.balance.read() + msg_amount());
        }
    }

    #[storage(read, write)]
    fn send_funds(amount_to_send: u64, recipient_address: Address) {
        let sender = msg_sender().unwrap();
        match sender {
            Identity::Address(addr) => assert(addr == OWNER_ADDRESS),
            _ => revert(0),
        };

        let current_balance = storage.balance.read();
        assert(current_balance >= amount_to_send);

        storage.balance.write(current_balance - amount_to_send);

        // Note: `transfer_to_address()` is not a call and thus not an
        // interaction. Regardless, this code conforms to
        // checks-effects-interactions to avoid re-entrancy.
        transfer_to_address(recipient_address, ASSET_ID, amount_to_send);
    }
}