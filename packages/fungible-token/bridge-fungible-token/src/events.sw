library;

pub struct RefundRegisteredEvent {
    amount: b256,
    token_address: b256,
    token_id: b256,
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

pub struct ClaimRefundEvent {
    amount: b256,
    from: b256,
    token_address: b256,
    token_id: b256,
}
