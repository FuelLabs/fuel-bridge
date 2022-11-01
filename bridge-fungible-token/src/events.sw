library events;

use std::{contract_id::ContractId, identity::Identity, u256::U256};

pub struct RefundRegisteredEvent {
    from: b256,
    asset: b256,
    amount: b256,
}

pub struct DepositEvent {
    to: Address,
    from: b256,
    amount: u64,
}

pub struct WithdrawalEvent {
    to: b256,
    from: Identity,
    amount: u64,
}
