predicate;

use std::{assert::assert, hash::sha256, tx::tx_script_bytecode};

/// Predicate verifying a message input is being spent according to the rules for a valid deposit
fn main() -> bool {
    // The hash of the (padded) script which must spend the input belonging to this predicate
    let SPENDING_SCRIPT_HASH = 0x0f64699ad97a254a7fca28364e2b5ec0156507cd7beb77fb25ff5133f8b6ad1a;

    // Verify script bytecode hash is expected

    // Note `tx_script_bytecode` casts the bytecode to an array of words, so the bytecode ends up padded to the nearest word.
    // Here, 8 * 102 = 816, which is 4 bytes longer than the script's actual size
    // We therefore need to pad the script by 4 bytes before hashing in the SDK to generate the hard-coded SPENDING_SCRIPT_HASH above
    let script_bytcode: [u64;
    102] = tx_script_bytecode();
    sha256(script_bytcode) == SPENDING_SCRIPT_HASH
}
