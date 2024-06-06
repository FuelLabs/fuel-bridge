contract;

use std::{
    call_frames::first_param,
    constants::ZERO_B256,
    execution::run_external,
    hash::Hash,
    hash::sha256,
    string::String,
};
use standards::{src14::SRC14, src20::SRC20, src5::{AccessError, SRC5, State}};
use contract_message_receiver::MessageReceiver;
use interface::{bridge::Bridge, src7::{Metadata, SRC7}};

#[namespace(SRC14)]
storage {
    // target is at sha256("storage_SRC14_0")
    target: ContractId = ContractId::zero(),
    owner: State = State::Initialized(Identity::Address(Address::zero())),
}

impl SRC5 for Contract {
    #[storage(read)]
    fn owner() -> State {
        storage.owner.read()
    }
}

impl SRC14 for Contract {
    #[storage(write)]
    fn set_proxy_target(new_target: ContractId) {
        only_owner();
        storage.target.write(new_target);
    }
}

#[fallback]
#[storage(read)]
fn fallback() {
    // pass through any other method call to the target
    run_external(storage.target.read())
}

#[storage(read)]
fn only_owner() {
    require(
        storage
            .owner
            .read() == State::Initialized(msg_sender().unwrap()),
        AccessError::NotOwner,
    );
}

abi ChangeOwner {
    #[storage(read, write)]
    fn change_owner(new_owner: Identity);
}

impl ChangeOwner for Contract {
    #[storage(read, write)]
    fn change_owner(new_owner: Identity) {
        only_owner();
        storage.owner.write(State::Initialized(new_owner));
    }
}

// abi Diamonds {
//     #[storage(read,write)]
//     fn set_facet_for_selector(method_selector: u64, facet: ContractId);
// }

// impl Diamonds for Contract {
//     #[storage(read,write)]
//     fn set_facet_for_selector(method_selector: u64, facet: ContractId) {
//         storage.facets.insert(method_selector, facet);
//     }
// }

// #[fallback, storage(read)]
// fn fallback() -> Option<ContractId> {
//     let method_selector = first_param();

//     storage.facets.get(method_selector).try_read()
// }

// impl Bridge for Contract {
//     #[storage(read, write)]
//     fn claim_refund(from: b256, token_address: b256, token_id: b256) {
//         run_external(TARGET)
//     }

//     #[payable]
//     #[storage(read, write)]
//     fn withdraw(to: b256) {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn bridged_token_gateway() -> b256 {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn asset_to_sub_id(asset_id: AssetId) -> SubId {
//         run_external(TARGET)
//     }

//     #[storage(read)]
//     fn asset_to_l1_address(asset_id: AssetId) -> b256 {
//         run_external(TARGET)
//     }

//     fn double_value(foo: u64) -> u64 {
//         run_external(TARGET)
//     }
// }

// impl MessageReceiver for Contract {
//     #[payable]
//     #[storage(read, write)]
//     fn process_message(msg_idx: u64) {
//         run_external(TARGET)
//     }
// }

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
