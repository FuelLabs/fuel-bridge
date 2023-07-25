use crate::env::BridgeFungibleTokenContract;
use fuels::accounts::wallet::WalletUnlocked;
use fuels::programs::call_response::FuelCallResponse;
use fuels::types::Bits256;

pub(crate) async fn claim_refund(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    originator: Bits256,
    asset: Bits256,
) -> FuelCallResponse<()> {
    contract
        .methods()
        .claim_refund(originator, asset)
        .call()
        .await
        .unwrap()
}

pub(crate) async fn withdraw(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    to: Bits256,
) -> FuelCallResponse<()> {
    contract.methods().withdraw(to).call().await.unwrap()
}

pub(crate) async fn bridged_token(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
) -> Bits256 {
    contract
        .methods()
        .bridged_token()
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn bridged_token_decimals(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
) -> u8 {
    contract
        .methods()
        .bridged_token_decimals()
        .call()
        .await
        .unwrap()
        .value
}

pub(crate) async fn bridged_token_gateway(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
) -> Bits256 {
    contract
        .methods()
        .bridged_token_gateway()
        .call()
        .await
        .unwrap()
        .value
}
