library;

pub struct MessageData {
    token: b256,
    from: b256,
    to: Identity,
    amount: b256,
    len: u64,
}
