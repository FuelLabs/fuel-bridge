use std::fs;

const BASE_ASSET_CONTRACT_BYTECODE_PATH: &str =
    "out/release/base-asset-contract.bin";
    const BASE_ASSET_CONTRACT_HEX_PATH: &str =
    "binaries/base-asset-contract.hex";

#[tokio::test]
async fn expected_hex_matches_binaries() {
    // Get the bytecode and hex for the contract
    let file_bytecode = base_asset_contract_bytecode();
    let file_hex = base_asset_contract_hex();

    // Convert to hex
    let hex_bytecode = hex::encode(&file_bytecode);

    // Assert the hex is correct
    assert_eq!(file_hex, hex_bytecode);
}

pub fn base_asset_contract_bytecode() -> Vec<u8> {
    fs::read(BASE_ASSET_CONTRACT_BYTECODE_PATH).unwrap()
}

pub fn base_asset_contract_hex() -> String {
    fs::read_to_string(BASE_ASSET_CONTRACT_HEX_PATH).unwrap()
}
