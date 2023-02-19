library data;

use std::{address::Address, contract_id::ContractId};

pub struct MessageData {
    token: b256,
    from: b256,
    to: Address,
    amount: b256,
}
