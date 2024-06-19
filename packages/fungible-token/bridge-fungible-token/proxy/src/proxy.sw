contract;

use std::{
    call_frames::first_param,
    execution::run_external,
    hash::{sha256, Hash},
    string::String,
    constants::ZERO_B256,
};
use standards::{src14::SRC14, src20::SRC20, src5::{AccessError, SRC5, State}};
use contract_message_receiver::MessageReceiver;
use interface::{bridge::Bridge, src7::{Metadata, SRC7}};

pub enum ProxyErrors {
    IdentityZero: (),
}

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
    // owner is at sha256("storage_SRC14_1")
    owner: State = State::Uninitialized,
}

impl SRC14 for Contract {
    #[storage(write)]
    fn set_proxy_target(new_target: ContractId) {
        only_owner();
        require(new_target.bits() != ZERO_B256, ProxyErrors::IdentityZero);
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
        require(new_owner.bits() != ZERO_B256, ProxyErrors::IdentityZero);
        storage.owner.write(State::Initialized(new_owner));
    }
}