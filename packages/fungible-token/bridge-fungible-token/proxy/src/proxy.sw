contract;

use std::{
    call_frames::first_param,
    execution::run_external,
    hash::{sha256, Hash},
    string::String,
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

    #[storage(read, write)]
    fn _proxy_revoke_ownership();
}

configurable {
    INITIAL_OWNER: State = State::Uninitialized,
    INITIAL_TARGET: ContractId = ContractId::zero()
}

#[namespace(SRC14)]
storage {
    // target is at sha256("storage_SRC14_0")
    target: Option<ContractId> = None,
    // owner is at sha256("storage_SRC14_1")
    owner: State = State::Uninitialized,
}

impl SRC14 for Contract {
    #[storage(write)]
    fn set_proxy_target(new_target: ContractId) {
        only_owner();
        require(new_target.bits() != b256::zero(), ProxyErrors::IdentityZero);
        storage.target.write(Some(new_target));
    }
}

#[fallback]
#[storage(read)]
fn fallback() {
    // pass through any other method call to the target
    run_external(storage.target.read().unwrap_or(INITIAL_TARGET))
}

#[storage(read)]
fn only_owner() {

    let owner = match storage.owner.read() {
        State::Uninitialized => INITIAL_OWNER,
        state => state,
    };

    require(
        owner == State::Initialized(msg_sender().unwrap()),
        AccessError::NotOwner,
    );
}

impl Proxy for Contract {

    #[storage(read)]
    fn _proxy_owner() -> State {
        let owner = storage.owner.read();

        match owner {
            State::Uninitialized => INITIAL_OWNER,
            _ => owner, 
        }
    }

    #[storage(read)]
    fn _proxy_target() -> ContractId {
        storage.target.read().unwrap_or(INITIAL_TARGET)
    }

    #[storage(read, write)]
    fn _proxy_change_owner(new_owner: Identity) {
        only_owner();
        require(new_owner.bits() != b256::zero(), ProxyErrors::IdentityZero);
        storage.owner.write(State::Initialized(new_owner));
    }

    #[storage(read,write)]
    fn _proxy_revoke_ownership() {
        only_owner();
        storage.owner.write(State::Revoked);
    }
}