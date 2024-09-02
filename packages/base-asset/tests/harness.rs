use fuels::{
    prelude::*,
    types::{Bytes32, ContractId},
};
use sha2::{Digest, Sha256};
use std::{fs, str::FromStr};

// Matches the README addresses
const BASE_ASSET_CONTRACT_ID: &str =
    "0xab724dea11ad246edc359338a6e3cfe6dabdf18740c3b2cf417cc4b1f9453512";
const BASE_ASSET_ID: &str = "0x157b59fb83fc65a53100dda502e6100fc6b1e28ceee3d038c5ef3084bfeae75e";
const BASE_ASSET_CONTRACT_BYTECODE_PATH: &str = "out/release/base-asset-contract.bin";
const BASE_ASSET_CONTRACT_HEX_PATH: &str = "bin/base-asset-contract.hex";
const BASE_ASSET_CONTRACT_BIN_PATH: &str = "bin/base-asset-contract.bin";

abigen!(Contract(
    name = "BaseAssetContract",
    abi = "packages/base-asset/out/release/base-asset-contract-abi.json",
),);

async fn get_contract_instance() -> (BaseAssetContract<WalletUnlocked>, ContractId) {
    // Launch a local network and deploy the contract
    let mut wallets = launch_custom_provider_and_get_wallets(
        WalletsConfig::new(
            Some(1),             /* Single wallet */
            Some(1),             /* Single coin (UTXO) */
            Some(1_000_000_000), /* Amount per coin */
        ),
        None,
        None,
    )
    .await
    .unwrap();
    let wallet = wallets.pop().unwrap();

    let salt = [0u8; 32];
    let id = Contract::load_from(
        BASE_ASSET_CONTRACT_BYTECODE_PATH,
        LoadConfiguration::default().with_salt(salt),
    )
    .unwrap()
    .deploy(&wallet, TxPolicies::default())
    .await
    .unwrap();

    let instance = BaseAssetContract::new(id.clone(), wallet);

    (instance, id.into())
}

#[tokio::test]
async fn asset_id_matches_expected() {
    let (_instance, id) = get_contract_instance().await;

    let base_asset_id = get_asset_id(Bytes32::zeroed(), id);

    assert_eq!(base_asset_id, AssetId::from_str(BASE_ASSET_ID).unwrap());
}

#[tokio::test]
async fn contract_id_matches_expected() {
    let (_instance, id) = get_contract_instance().await;

    assert_eq!(id, ContractId::from_str(BASE_ASSET_CONTRACT_ID).unwrap());
}

#[tokio::test]
async fn expected_hex_matches_bin() {
    // Get the bytecode and hex for the contract
    let compiled_bytecode = base_asset_contract_bytecode();
    let file_hex = base_asset_contract_hex();

    // Convert to hex
    let hex_bytecode = hex::encode(compiled_bytecode);

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

pub fn get_asset_id(sub_id: Bytes32, contract: ContractId) -> AssetId {
    let mut hasher = Sha256::new();
    hasher.update(*contract);
    hasher.update(*sub_id);
    AssetId::new(*Bytes32::from(<[u8; 32]>::from(hasher.finalize())))
}
