// MessageToGatewayPredicate
predicate;

use std::address::Address;
use std::tx::*;
use std::assert::assert;
use std::hash::*;

/// Get the destination address for coins to send for an output given a pointer to the output.
/// This method is only meaningful if the output type has the `to` field.
// TO DO: This should probably go in std::tx 
fn tx_output_to(ptr: u32) -> Address {

    let address_bytes = asm(r1, r2: ptr) {
        lw r1 r2 i8;
        r1: b256
    };

    ~Address::from(address_bytes)
}


fn get_input_type(index: u8) -> u8 {
    let ptr = tx_input_pointer(1);
    let input_type = tx_input_type(ptr);
    input_type
}

// Anyone-can-spend predicate that only releases coins to a specified address
fn main(receiver: Address) -> bool {

    // Transaction must have only four inputs: a Coin input (for fees), a Message, the gateway Contract, and the token Contract (in that order)
    let n_inputs = tx_inputs_count();
    assert(n_inputs == 4);
    assert(
        get_input_type(0) == 0u8 && // index for Input.Coin?
        get_input_type(1) == 2u8 && // index for Input.Message?
        get_input_type(2) == 1u8 && // index for Input.Contract?
        get_input_type(3) == 1u8    // index for Input.Contract?
        ); 


    /* TO DO: verify both contract inputs exist (how?)

    */


    // Verify a reasonable(?) amount of gas. (Do we also need to check Coin input >= gas_limit * gas_price ? 
    const REASONABLE_GAS = 42;
    let gasLimit = tx_gas_limit();
    assert(gasLimit >= REASONABLE_GAS);


    // TO DO : blocked by get_script_data()
    let script_data = 0x00;  // get_script_data(); <- What type will this even be?
    let script_data_hash = sha256(script_data);
    let EXPECTED_SCRIPT_HASH = 0x1010101010101010101010101010101010101010101010101010101010101010; // Hardcode hash of script that calls gateway with processMessage()
    assert(script_data_hash == EXPECTED_SCRIPT_HASH);
    

    // need to check if a == output.to for the Coin output. But can't loop in a predicate...
    // Assume it's first output for now:
    let ptr = tx_output_pointer(0);
    let address = tx_output_to(ptr);
    assert(address == receiver);

    true
}
