mod predicate_asm;
mod script_asm;

use fuel_tx::Contract;
use sha2::{Digest, Sha256};

// Make the script and predicate bytecode public
pub use predicate_asm::bytecode as predicate_bytecode;
pub use script_asm::bytecode as script_bytecode;

// Gets the hash of the message-to-contract script
pub fn script_hash() -> [u8; 32] {
    let script = script_asm::bytecode();
    let mut script_hasher = Sha256::new();
    script_hasher.update(script);
    script_hasher.finalize().into()
}

// Gets the root of the message-to-contract predicate
pub fn predicate_root() -> [u8; 32] {
    let predicate = predicate_asm::bytecode();
    let root = Contract::root_from_code(&predicate);
    root.into()
}
