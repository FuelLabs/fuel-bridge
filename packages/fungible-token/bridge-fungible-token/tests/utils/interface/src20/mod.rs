use crate::utils::setup::BridgeFungibleTokenContract;
use fuels::{accounts::wallet::WalletUnlocked, types::AssetId};

pub(crate) async fn total_supply(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<u64> {
    contract
        .methods()
        .total_supply(asset_id)
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn total_assets(contract: &BridgeFungibleTokenContract<WalletUnlocked>) -> u64 {
    contract
        .methods()
        .total_assets()
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn name(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<String> {
    contract
        .methods()
        .name(asset_id)
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn symbol(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<String> {
    contract
        .methods()
        .symbol(asset_id)
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn decimals(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    asset_id: AssetId,
) -> Option<u8> {
    contract
        .methods()
        .decimals(asset_id)
        .call()
        .await
        .unwrap()
        .value
}
