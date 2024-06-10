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

abi Proxy {
    #[storage(read)]
    fn _proxy_owner() -> State;

    #[storage(read)]
    fn _proxy_target() -> ContractId;

    #[storage(read, write)]
    fn _proxy_change_owner(new_owner: Identity);
}

#[namespace(SRC14)]
storage {
    // target is at sha256("storage_SRC14_0")
    target: ContractId = ContractId::zero(),
    owner: State = State::Initialized(Identity::Address(Address::zero())),
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

impl Proxy for Contract {

    #[storage(read)]
    fn _proxy_owner() -> State {
        storage.owner.read()
    }

    #[storage(read)]
    fn _proxy_target() -> ContractId {
        storage.target.read()
    }

    #[storage(read, write)]
    fn _proxy_change_owner(new_owner: Identity) {
        only_owner();
        storage.owner.write(State::Initialized(new_owner));
    }
}