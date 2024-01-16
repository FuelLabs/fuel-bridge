use fuel_tx::Input;

pub const SCRIPT_HASH: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/out/contract_message_script_hash.bin"
));
pub const SCRIPT_ASM: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/out/contract_message_script.bin"
));
pub const PREDICATE_BYTECODE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/out/contract_message_predicate.bin"
));
pub const DEFAULT_PREDICATE_ROOT: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/out/contract_message_predicate_default_root.bin"
));

// Gets the bytecode for the message-to-contract script
pub fn script_bytecode() -> Vec<u8> {
    SCRIPT_ASM.to_vec()
}

// Gets the bytecode for the message-to-contract predicate
pub fn predicate_bytecode() -> Vec<u8> {
    PREDICATE_BYTECODE.to_vec()
}

// Gets the hash of the message-to-contract script
pub fn script_hash() -> [u8; 32] {
    SCRIPT_HASH
        .try_into()
        .expect("Should be checked at compile time")
}

// Gets the root of the message-to-contract predicate
pub fn predicate_root() -> [u8; 32] {
    let root = Input::predicate_owner(PREDICATE_BYTECODE);
    root.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Ensure the predicate bytecode doesn't change
    #[test]
    fn snapshot_predicate_bytecode() {
        let bytecode = predicate_bytecode();
        let serialized = hex::encode(bytecode);
        insta::assert_snapshot!(serialized);
    }

    // Ensure the script bytecode doesn't change
    #[test]
    fn snapshot_script_bytecode() {
        let bytecode = script_bytecode();
        let serialized = hex::encode(bytecode);
        insta::assert_snapshot!(serialized);
    }
}
