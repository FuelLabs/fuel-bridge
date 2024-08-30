contract;

use std::execution::run_external;
use standards::{src14::SRC14, src5::{AccessError, State}};

pub enum ProxyErrors {
    IdentityZero: (),
}

abi Proxy {
    #[storage(read)]
    fn _proxy_owner() -> State;

    #[storage(read, write)]
    fn _proxy_change_owner(new_owner: Identity);

    #[storage(read, write)]
    fn _proxy_revoke_ownership();
}

configurable {
    INITIAL_OWNER: State = State::Uninitialized,
    INITIAL_TARGET: ContractId = ContractId::zero(),
}

storage {
    SRC14 {
        // target is at sha256("storage_SRC14_0")
        target: Option<ContractId> = None,
        // owner is at sha256("storage_SRC14_1")
        owner: State = State::Uninitialized,
    },
}

impl SRC14 for Contract {
    #[storage(read, write)]
    fn set_proxy_target(new_target: ContractId) {
        only_owner();
        require(new_target.bits() != b256::zero(), ProxyErrors::IdentityZero);
        storage::SRC14.target.write(Some(new_target));
    }

    #[storage(read)]
    fn proxy_target() -> Option<ContractId> {
        Some(storage::SRC14.target.read().unwrap_or(INITIAL_TARGET))
    }
}

#[fallback]
#[storage(read)]
fn fallback() {
    // pass through any other method call to the target
    run_external(storage::SRC14.target.read().unwrap_or(INITIAL_TARGET))
}

#[storage(read)]
fn only_owner() {
    let owner = match storage::SRC14.owner.read() {
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
        let owner = storage::SRC14.owner.read();

        match owner {
            State::Uninitialized => INITIAL_OWNER,
            _ => owner,
        }
    }

    #[storage(read, write)]
    fn _proxy_change_owner(new_owner: Identity) {
        only_owner();
        require(new_owner.bits() != b256::zero(), ProxyErrors::IdentityZero);
        storage::SRC14.owner.write(State::Initialized(new_owner));
    }

    #[storage(read, write)]
    fn _proxy_revoke_ownership() {
        only_owner();
        storage::SRC14.owner.write(State::Revoked);
    }
}
