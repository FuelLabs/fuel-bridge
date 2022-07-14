script;

use L2ERC20Gateway_abi::L2ERC20Gateway;
use std::contract_id::ContractId;
use std::tx::{b256_from_pointer_offset, tx_input_pointer};

/// Get the ID of a contract input
/// This function is the same as the one in the predicate, except here we do not check the input is the correct type.
/// The predicate has already checked that this input is an InputContract, so there's no need to check again
fn input_contract_id(index: u8) -> ContractId {
    let ptr = tx_input_pointer(index);
    let contract_id_bytes = b256_from_pointer_offset(ptr, 128); // Contract ID starts at 17th word: 16 * 8 = 128
    ~ContractId::from(contract_id_bytes)
}

fn main() -> bool {
    // Get contract ID. Predicate has already checked this is an InputContract and that it corresponds to the contract ID specified in the Message data
    let input_contract_id = input_contract_id(2);

    // Finalize the deposit on the given contract
    let token = abi(L2ERC20Gateway, input_contract_id.into());
    let value = token.finalize_deposit();
    true
}
