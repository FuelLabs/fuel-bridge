library transaction_utils;

use std::constants::ZERO_B256;
use std::{
    inputs::{
        GTF_INPUT_COIN_AMOUNT,
        GTF_INPUT_COIN_ASSET_ID,
        GTF_INPUT_MESSAGE_DATA,
        GTF_INPUT_MESSAGE_DATA_LENGTH,
    },
    outputs::{
        GTF_OUTPUT_TYPE,
    },
    tx::{
        GTF_SCRIPT_GAS_LIMIT,
        GTF_SCRIPT_GAS_PRICE,
        GTF_SCRIPT_INPUTS_COUNT,
        GTF_SCRIPT_OUTPUTS_COUNT,
        GTF_SCRIPT_SCRIPT,
        GTF_SCRIPT_SCRIPT_LENGTH,
    },
};

// TODO: replace GTF consts with direct references to tx.sw, inputs.sw, and outputs.sw from std lib
const GTF_INPUT_TYPE = 0x101;
const GTF_INPUT_CONTRACT_CONTRACT_ID = 0x113;
const GTF_OUTPUT_CONTRACT_INPUT_INDEX = 0x205;

const OUTPUT_TYPE_CONTRACT = 1u8;
const OUTPUT_TYPE_CHANGE = 3u8;
const OUTPUT_TYPE_VARIABLE = 4u8;

const INPUT_TYPE_COIN = 0u8;
const INPUT_TYPE_CONTRACT = 1u8;
const INPUT_TYPE_MESSAGE = 2u8;

/// Get the transaction gas price
pub fn tx_gas_price() -> u64 {
    __gtf::<u64>(0, GTF_SCRIPT_GAS_PRICE)
}

/// Get the transaction gas price
pub fn tx_gas_limit() -> u64 {
    __gtf::<u64>(0, GTF_SCRIPT_GAS_LIMIT)
}

/// Get the hash of the script bytecode
pub fn tx_script_bytecode_hash() -> b256 {
    let mut result_buffer = ZERO_B256;
    asm(hash: result_buffer, ptr: __gtf::<u64>(0, GTF_SCRIPT_SCRIPT), len: __gtf::<u64>(0, GTF_SCRIPT_SCRIPT_LENGTH)) {
        s256 hash ptr len;
        hash: b256
    }
}

/// Get the transaction inputs count
pub fn input_count() -> u64 {
    __gtf::<u64>(0, GTF_SCRIPT_INPUTS_COUNT)
}

/// Verifies an input at the given index is a coin input
pub fn verify_input_coin(index: u64) -> bool {
    __gtf::<u64>(index, GTF_INPUT_TYPE) == INPUT_TYPE_COIN
}
/// Verifies an input at the given index is a contract input
pub fn verify_input_contract(index: u64) -> bool {
    __gtf::<u64>(index, GTF_INPUT_TYPE) == INPUT_TYPE_CONTRACT
}

/// Verifies an input at the given index is a message input
pub fn verify_input_message(index: u64) -> bool {
    __gtf::<u64>(index, GTF_INPUT_TYPE) == INPUT_TYPE_MESSAGE
}

/// Get the length of a message input data
pub fn input_message_data_length(index: u64) -> u64 {
    __gtf::<u64>(index, GTF_INPUT_MESSAGE_DATA_LENGTH)
}

/// Get the data of a message input
pub fn input_message_data<T>(index: u64, offset: u64) -> T {
    // TODO: look into supporting per byte offsets
    let data_ptr = __gtf::<raw_ptr>(index, GTF_INPUT_MESSAGE_DATA);
    data_ptr.add::<u64>(offset / 8).read::<T>()
}

/// Get the ID of a contract input
pub fn input_contract_contract_id(index: u64) -> b256 {
    __gtf::<b256>(index, GTF_INPUT_CONTRACT_CONTRACT_ID)
}

/// Get the asset ID of a coin input
pub fn input_coin_asset_id(index: u64) -> b256 {
    __gtf::<b256>(index, GTF_INPUT_COIN_ASSET_ID)
}

/// Get the amount of a coin input
pub fn input_coin_amount(index: u64) -> u64 {
    __gtf::<u64>(index, GTF_INPUT_COIN_AMOUNT)
}

/// Get the transaction outputs count
pub fn output_count() -> u64 {
    __gtf::<u64>(0, GTF_SCRIPT_OUTPUTS_COUNT)
}

/// Verifies an output at the given index is a contract output
pub fn verify_output_contract(index: u64) -> bool {
    __gtf::<u64>(index, GTF_OUTPUT_TYPE) == OUTPUT_TYPE_CONTRACT
}

/// Verifies an output at the given index is a change output
pub fn verify_output_change(index: u64) -> bool {
    __gtf::<u64>(index, GTF_OUTPUT_TYPE) == OUTPUT_TYPE_CHANGE
}

/// Verifies an output at the given index is a variable output
pub fn verify_output_variable(index: u64) -> bool {
    __gtf::<u64>(index, GTF_OUTPUT_TYPE) == OUTPUT_TYPE_VARIABLE
}

/// Get the input index of a change output
pub fn output_contract_input_index(index: u64) -> u64 {
    __gtf::<u64>(index, GTF_OUTPUT_CONTRACT_INPUT_INDEX)
}
