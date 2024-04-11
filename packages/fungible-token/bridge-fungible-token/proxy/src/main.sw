contract;

use std::{
    execution::run_external,
    constants::ZERO_B256,
    string::String,
};
use src_20::SRC20;
use contract_message_receiver::MessageReceiver;
use interface::{bridge::Bridge, src7::{Metadata, SRC7}};


configurable {
    TARGET: ContractId = ContractId::from(ZERO_B256)
}



impl Bridge for Contract {
    #[storage(read, write)]
    fn claim_refund(from: b256, token_address: b256, token_id: b256) {
        run_external(TARGET)
    }

    #[payable]
    #[storage(read, write)]
    fn withdraw(to: b256) {
        run_external(TARGET)
    }

    fn bridged_token_gateway() -> b256 {
        run_external(TARGET)
    }

    #[storage(read)]
    fn asset_to_sub_id(asset_id: AssetId) -> SubId {
        run_external(TARGET)
    }

    #[storage(read)]
    fn asset_to_l1_address(asset_id: AssetId) -> b256 {
        run_external(TARGET)
    }

    fn double_value(foo: u64) -> u64 {
        run_external(TARGET)
    }
}

impl MessageReceiver for Contract {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u64) {
        run_external(TARGET)
    }
}

// // Uncomment this and compiler fails

// impl SRC20 for Contract {
//     #[storage(read)]
//     fn total_assets() -> u64 {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn total_supply(asset: AssetId) -> Option<u64> {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn name(asset: AssetId) -> Option<String> {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn symbol(asset: AssetId) -> Option<String> {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn decimals(asset: AssetId) -> Option<u8> {
//         run_external(TARGET)
//     }
// }