library;

use std::u256::U256;

pub struct RefundRegisteredEvent {
    amount: b256,
    asset: b256,
    from: b256,
}

pub struct DepositEvent {
    amount: u64,
    from: b256,
    to: Identity,
}

pub struct WithdrawalEvent {
    amount: u64,
    from: Identity,
    to: b256,
}
