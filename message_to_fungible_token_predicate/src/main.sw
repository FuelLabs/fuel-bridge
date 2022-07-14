predicate;

use std::{
    address::Address,
    tx::{
        INPUT_COIN,
        INPUT_CONTRACT,
        INPUT_MESSAGE,
        OUTPUT_CHANGE,
        OUTPUT_CONTRACT,
        OUTPUT_VARIABLE,
        b256_from_pointer_offset,
        tx_gas_limit,
        tx_input_pointer,
        tx_input_type,
        tx_inputs_count,
        tx_output_type,
        tx_outputs_count,
    tx_script_bytecode}
};

use std::assert::assert;
use std::hash::sha256;
use std::contract_id::ContractId;

/// Get the ID of a contract input
fn input_contract_id(index: u8) -> ContractId {
    // Check that input at this index is a contract input
    assert(tx_input_type(index) == INPUT_CONTRACT);
    let ptr = tx_input_pointer(index);
    let contract_id_bytes = b256_from_pointer_offset(ptr, 128); // Contract ID starts at 17th word: 16 * 8 = 128
    ~ContractId::from(contract_id_bytes)
}

/// Get the contract ID from a message input's data
/// Note : This function is specific to this bridge design
fn contract_id_from_message_input(index: u8) -> ContractId {
    // Check that input at this index is a message input
    assert(tx_input_type(index) == INPUT_MESSAGE);

    let ptr = tx_input_pointer(index);
    let contract_id_bytes = b256_from_pointer_offset(ptr, 192); // Contract ID is at start of data, which is at 24th word: 24 * 8 = 192
    ~ContractId::from(contract_id_bytes)
}

/// Predicate verifying a message input is being spent according to the rules for a valid deposit
fn main() -> bool {
    /////////////////
    /// CONSTANTS ///
    /////////////////

    // The minimum gas limit for the transaction not to revert out-of-gas.
    const MIN_GAS = 42;

    // The hash of the script which must spend the input belonging to this predicate
    // This ensures the coins can only be spent in a call to `TokenContract.finalizeDeposit()`
    // Note: The script must be right-padded to the next full word before hashing, to match with `get_script_bytecode()`
    const SPENDING_SCRIPT_HASH = 0xf127314d1d30bb8398c2fcde2a1d799a61d3dc5875a56a0e047807e51fd6f9ea;

    //////////////////
    /// CONDITIONS ///
    //////////////////

    // Verify script bytecode hash matches
    let script_bytcode: [u64;
    36] = tx_script_bytecode(); // Note : Make sure length is script bytecode length rounded up to next word
    assert(sha256(script_bytcode) == SPENDING_SCRIPT_HASH);

    // Verify gas limit is high enough
    assert(tx_gas_limit() >= MIN_GAS);

    // Transaction must have exactly three inputs: a Coin input (for fees), a Message, and the token Contract (in that order)
    assert(tx_inputs_count() == 3);
    assert(tx_input_type(0) == INPUT_COIN);
    let message_data_contract_id = contract_id_from_message_input(1);
    let input_contract_id = input_contract_id(2);

    // Check contract ID from the contract input matches the one specified in the message data
    assert(input_contract_id == message_data_contract_id);

    // Transation must have exactly 3 outputs: OutputVariable, OutputContract, and OutputChange (in that order)
    let output_count = tx_outputs_count();
    assert(output_count == 3 && tx_output_type(0) == OUTPUT_VARIABLE && tx_output_type(1) == OUTPUT_CONTRACT && tx_output_type(2) == OUTPUT_CHANGE);

    true
}
