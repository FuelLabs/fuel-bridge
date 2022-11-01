library data;

use std::{address::Address, contract_id::ContractId};

pub struct MessageData {
    fuel_token: ContractId,
    l1_asset: b256,
    from: b256,
    to: Address,
    amount: b256,
}
