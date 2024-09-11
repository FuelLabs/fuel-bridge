use fuels::{
    prelude::*,
    types::ContractId,
};

const BASE_ASSET_CONTRACT_BYTECODE_PATH: &str = "out/release/base-asset-contract.bin";

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
async fn can_be_deployed() {
    let (_instance, id) = get_contract_instance().await;

    assert_ne!(id, ContractId::zeroed());
}