use std::fs;

const BASE_ASSET_CONTRACT_BYTECODE_PATH: &str = "out/release/base-asset-contract.bin";
const BASE_ASSET_CONTRACT_HEX_PATH: &str = "bin/base-asset-contract.hex";
const BASE_ASSET_CONTRACT_BIN_PATH: &str = "bin/base-asset-contract.bin";

#[tokio::test]
async fn expected_hex_matches_bin() {
    // Get the bytecode and hex for the contract
    let compiled_bytecode = base_asset_contract_bytecode();
    let file_hex = base_asset_contract_hex();

    // Convert to hex
    let hex_bytecode = hex::encode(&compiled_bytecode);

    // Assert the hex is correct
    assert_eq!(file_hex, hex_bytecode);
}

#[tokio::test]
async fn compiled_bin_matches_expected_bin() {
    // Get the bytecode and hex for the contract
    let compiled_bytecode = base_asset_contract_bytecode();
    let file_bytecode = base_asset_contract_binaires();

    // Assert the hex is correct
    assert_eq!(file_bytecode, compiled_bytecode);
}

pub fn base_asset_contract_bytecode() -> Vec<u8> {
    fs::read(BASE_ASSET_CONTRACT_BYTECODE_PATH).unwrap()
}

pub fn base_asset_contract_hex() -> String {
    fs::read_to_string(BASE_ASSET_CONTRACT_HEX_PATH).unwrap()
}

pub fn base_asset_contract_binaires() -> Vec<u8> {
    fs::read(BASE_ASSET_CONTRACT_BIN_PATH).unwrap()
}
