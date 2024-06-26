use crate::utils::setup::BridgeFungibleTokenContract;
use fuels::{accounts::wallet::WalletUnlocked, prelude::Bech32ContractId, types::AssetId};

pub(crate) async fn total_supply(
    implementation_contract_id: &Bech32ContractId,
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<u64> {
    contract
        .methods()
        .total_supply(asset_id)
        .with_contract_ids(&[implementation_contract_id.clone()])
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn total_assets(
    implementation_contract_id: &Bech32ContractId,
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
) -> u64 {
    contract
        .methods()
        .total_assets()
        .with_contract_ids(&[implementation_contract_id.clone()])
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn name(
    implementation_contract_id: &Bech32ContractId,
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<String> {
    contract
        .methods()
        .name(asset_id)
        .with_contract_ids(&[implementation_contract_id.clone()])
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn symbol(
    implementation_contract_id: &Bech32ContractId,
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<String> {
    contract
        .methods()
        .symbol(asset_id)
        .with_contract_ids(&[implementation_contract_id.clone()])
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn decimals(
    implementation_contract_id: &Bech32ContractId,
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<u8> {
    contract
        .methods()
        .decimals(asset_id)
        .with_contract_ids(&[implementation_contract_id.clone()])
        .call()
        .await
        .unwrap()
        .value
}
