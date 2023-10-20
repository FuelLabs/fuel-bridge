use crate::utils::setup::BridgeFungibleTokenContract;
use fuels::{accounts::wallet::WalletUnlocked, types::AssetId as FuelsAssetId};

pub(crate) async fn total_supply(contract: &BridgeFungibleTokenContract<WalletUnlocked>, asset_id: FuelsAssetId) -> Option<u64> {
    contract
        .methods()
        .total_supply(asset_id)
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn name(contract: &BridgeFungibleTokenContract<WalletUnlocked>, asset_id: FuelsAssetId) -> Option<String> {
    Some(contract
        .methods()
        .fake(asset_id)
        .call()
        .await
        .unwrap()
        .value)
        
}

pub(crate) async fn symbol(contract: &BridgeFungibleTokenContract<WalletUnlocked>, asset_id: FuelsAssetId) -> Option<String> {
    contract
        .methods()
        .symbol(asset_id)
        .call()
        .await
        .unwrap()
        .value
        
}

pub(crate) async fn decimals(contract: &BridgeFungibleTokenContract<WalletUnlocked>, asset_id: FuelsAssetId) -> Option<u8> {
    contract.methods().decimals(asset_id).call().await.unwrap().value
}
