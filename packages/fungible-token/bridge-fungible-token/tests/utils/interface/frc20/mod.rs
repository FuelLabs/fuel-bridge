use crate::utils::setup::BridgeFungibleTokenContract;
use fuels::{accounts::wallet::WalletUnlocked, types::U256};

pub(crate) async fn total_supply(contract: &BridgeFungibleTokenContract<WalletUnlocked>) -> U256 {
    contract
        .methods()
        .total_supply()
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn name(contract: &BridgeFungibleTokenContract<WalletUnlocked>) -> String {
    contract
        .methods()
        .name()
        .call()
        .await
        .unwrap()
        .value
        .to_string()
}

pub(crate) async fn symbol(contract: &BridgeFungibleTokenContract<WalletUnlocked>) -> String {
    contract
        .methods()
        .symbol()
        .call()
        .await
        .unwrap()
        .value
        .to_string()
}

pub(crate) async fn decimals(contract: &BridgeFungibleTokenContract<WalletUnlocked>) -> u8 {
    contract.methods().decimals().call().await.unwrap().value
}