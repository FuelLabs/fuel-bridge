use crate::utils::setup::{get_asset_id, BridgeFungibleTokenContract};
use fuels::{
    accounts::wallet::WalletUnlocked,
    prelude::{CallParameters, TxParameters},
    programs::call_response::FuelCallResponse,
    types::Bits256,
};

pub(crate) async fn claim_refund(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    originator: Bits256,
    token_address: Bits256,
    token_id: Bits256,
) -> FuelCallResponse<()> {
    contract
        .methods()
        .claim_refund(originator, token_address, token_id)
        .call()
        .await
        .unwrap()
}

pub(crate) async fn withdraw(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    to: Bits256,
    amount: u64,
    gas: u64,
) -> FuelCallResponse<()> {
    let tx_params = TxParameters::new(Some(0), Some(gas), 0);
    let contract_id = contract.contract_id();
    let asset_id = get_asset_id(contract_id);
    let call_params = CallParameters::new(amount, asset_id, gas);

    contract
        .methods()
        .withdraw(to)
        .tx_params(tx_params)
        .call_params(call_params)
        .expect("Call param Error")
        .call()
        .await
        .unwrap()
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
