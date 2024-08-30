library;

use std::string::String;

pub struct RefundRegisteredEvent {
    pub amount: b256,
    pub token_address: b256,
    pub token_id: b256,
    pub from: b256,
}

pub struct DepositEvent {
    pub amount: u64,
    pub from: b256,
    pub to: Identity,
}

pub struct WithdrawalEvent {
    pub amount: u64,
    pub from: Identity,
    pub to: b256,
}

pub struct ClaimRefundEvent {
    pub amount: u256,
    pub from: b256,
    pub token_address: b256,
    pub token_id: b256,
}
