library transaction_utils;

use std::inputs::GTF_INPUT_MESSAGE_AMOUNT;

// TODO: replace GTF consts with direct references to tx.sw, inputs.sw, and outputs.sw from std lib
const GTF_INPUT_CONTRACT_CONTRACT_ID = 0x113;

/// Get the ID of a contract input
pub fn input_contract_contract_id(index: u64) -> b256 {
    __gtf::<b256>(index, GTF_INPUT_CONTRACT_CONTRACT_ID)
}

/// Get the amount of a message input
pub fn input_message_amount(index: u64) -> u64 {
    __gtf::<u64>(index, GTF_INPUT_MESSAGE_AMOUNT)
}
