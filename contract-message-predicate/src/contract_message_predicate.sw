predicate;

dep transaction_utils;

use std::constants::ZERO_B256;
use transaction_utils::{
    input_coin_amount,
    input_coin_asset_id,
    input_contract_contract_id,
    input_count,
    input_message_data,
    input_message_data_length,
    output_contract_input_index,
    output_count,
    tx_gas_limit,
    tx_gas_price,
    tx_script_bytecode_hash,
    verify_input_coin,
    verify_input_contract,
    verify_input_message,
    verify_output_change,
    verify_output_contract,
    verify_output_variable,
};

///////////////
// CONSTANTS //
///////////////
// The minimum gas limit for the transaction not to revert out-of-gas
// TODO: research what gas amount is reasonable and possibly move to config time
const MIN_GAS = 1_200_000;

// The hash of the script which must spend the input belonging to this predicate
const SPENDING_SCRIPT_HASH = 0x94de8159a7879edada9b0837456a917d4ba4f1eb68cae2d63ad3dc080bb4b372;

// The input and output index values
const INPUT_CONTRACT_INDEX = 0u8;
const INPUT_MESSAGE_INDEX = 1u8;
const INPUT_COIN_INDEX = 2u8;
const OUTPUT_CONTRACT_INDEX = 0u8;
const OUTPUT_CHANGE_INDEX = 1u8;
const OUTPUT_VARIABLE_INDEX = 2u8;

///////////
// UTILS //
///////////
/// Get the contract ID in the data of a message input
fn input_message_contract_id(index: u64) -> b256 {
    assert(input_message_data_length(index) >= 32);
    input_message_data::<b256>(index, 0)
}

///////////////
// PREDICATE //
///////////////
/// Predicate verifying a message input is being spent according to the rules for a valid message data relay to contract
fn main() -> bool {
    // Verify script bytecode hash matches
    assert(tx_script_bytecode_hash() == SPENDING_SCRIPT_HASH);

    // Verify the transaction inputs
    assert(input_count() == 3);
    assert(verify_input_contract(INPUT_CONTRACT_INDEX));
    assert(verify_input_message(INPUT_MESSAGE_INDEX));
    assert(verify_input_coin(INPUT_COIN_INDEX));
    assert(input_contract_contract_id(INPUT_CONTRACT_INDEX) == input_message_contract_id(INPUT_MESSAGE_INDEX));
    assert(input_coin_asset_id(INPUT_COIN_INDEX) == ZERO_B256);

    // Verify the transaction outputs
    assert(output_count() == 3);
    assert(verify_output_contract(OUTPUT_CONTRACT_INDEX));
    assert(verify_output_change(OUTPUT_CHANGE_INDEX));
    assert(verify_output_variable(OUTPUT_VARIABLE_INDEX));
    assert(output_contract_input_index(OUTPUT_CONTRACT_INDEX) == INPUT_CONTRACT_INDEX);

    // Verify there is a minimum amount of gas to process message
    assert(input_coin_amount(INPUT_COIN_INDEX) >= tx_gas_price() * MIN_GAS);
    assert(tx_gas_limit() >= MIN_GAS);

    // All checks have passed
    true
}
