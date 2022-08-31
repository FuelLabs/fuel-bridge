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

    // TODO: Replace with actual contract id
    ~ContractId::from(0xf5dbe963c235c1e54f8732f1ecdc955df2ad8db8c9ab58eea8e1338762bf8bc2) //~ContractId::from(contract_id_bytes)
}

/// Get the contract ID from a message input's data
fn contract_id_from_message_input(index: u8) -> ContractId {
    // TODO: Replace with actual message check once input messages are enabled in the sdk
    assert(tx_input_type(index) == INPUT_COIN);
    ~ContractId::from(0xf5dbe963c235c1e54f8732f1ecdc955df2ad8db8c9ab58eea8e1338762bf8bc2)/*
    // Check that input at this index is a message input
    assert(tx_input_type(index) == INPUT_MESSAGE);

    let ptr = tx_input_pointer(index);
    let contract_id_bytes = b256_from_pointer_offset(ptr, 192); // Contract ID is at start of data, which is at 24th word: 24 * 8 = 192
    ~ContractId::from(contract_id_bytes)
    */
}

/// Predicate verifying a message input is being spent according to the rules for a valid deposit
fn main() -> bool {
    ///////////////
    // CONSTANTS //
    ///////////////

    // The minimum gas limit for the transaction not to revert out-of-gas.
    const MIN_GAS = 42;

    // The hash of the script which must spend the input belonging to this predicate
    // This ensures the coins can only be spent in a call to `TokenContract.finalizeDeposit()`
    // Note: The script must be right-padded to the next full word before hashing, to match with `get_script_bytecode()`
    const SPENDING_SCRIPT_HASH = 0x2d235589506d17993e0b7aca4407a5ac1c325efd9d704ff94696a8f7c012ab9d;

    ////////////////
    // CONDITIONS //
    ////////////////

    // Verify script bytecode hash matches
    let script_bytcode: [u64;
    32] = tx_script_bytecode(); // Note : Make sure length is script bytecode length rounded up to next word
    assert(sha256(script_bytcode) == SPENDING_SCRIPT_HASH);

    // Verify gas limit is high enough
    //TODO: does gas limit include InputMessage amount? might need to just check avail balance - InputMessage amount
    assert(tx_gas_limit() >= MIN_GAS);

    // Transaction must have exactly three inputs: a Coin input (for fees), a Message, and the token Contract (in that order)
    assert(tx_inputs_count() == 3);
    assert(tx_input_type(0) == INPUT_COIN);
    let message_data_contract_id = contract_id_from_message_input(1);
    let input_contract_id = input_contract_id(2);

    // Check contract ID from the contract input matches the one specified in the message data
    assert(input_contract_id == message_data_contract_id);

    // Transation must have exactly 3 outputs: OutputVariable, OutputContract, and OutputChange (in that order)
    assert(tx_outputs_count() == 3);
    assert(tx_output_type(0) == OUTPUT_VARIABLE);
    assert(tx_output_type(1) == OUTPUT_CONTRACT);
    assert(tx_output_type(2) == OUTPUT_CHANGE);

    true
}
