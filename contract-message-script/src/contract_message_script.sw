script;

dep transaction_utils;

use contract_message_receiver::MessageReceiver;
use std::constants::ZERO_B256;
use transaction_utils::{input_contract_contract_id, input_message_amount};

///////////////
// CONSTANTS //
///////////////
// The input index values
const INPUT_CONTRACT_INDEX = 0u8;
const INPUT_MESSAGE_INDEX = 1u8;

////////////
// SCRIPT //
////////////
/// Script that relays a message and sends the message amount to a contract
fn main() -> bool {
    // Get contract to send message to
    let message_receiver = abi(MessageReceiver, input_contract_contract_id(INPUT_CONTRACT_INDEX));

    // Execute the message
    message_receiver.process_message {
        asset_id: ZERO_B256,
        coins: input_message_amount(INPUT_MESSAGE_INDEX),
    }(INPUT_MESSAGE_INDEX);
    true
}
