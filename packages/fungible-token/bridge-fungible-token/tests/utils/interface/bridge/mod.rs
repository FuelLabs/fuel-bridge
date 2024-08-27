use crate::utils::{
    constants::BRIDGED_TOKEN,
    setup::{get_asset_id, BridgeFungibleTokenContract},
};
use fuels::{
    accounts::wallet::WalletUnlocked,
    prelude::{CallParameters, TxPolicies},
    programs::responses::CallResponse,
    types::{bech32::Bech32ContractId, Bits256},
};

pub(crate) async fn claim_refund(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    implementation_contract_id: Bech32ContractId,
    originator: Bits256,
    token_address: Bits256,
    token_id: Bits256,
) -> CallResponse<()> {
    contract
        .methods()
        .claim_refund(originator, token_address, token_id)
        .with_contract_ids(&[implementation_contract_id])
        .call()
        .await
        .unwrap()
}

pub(crate) async fn withdraw(
    contract: &BridgeFungibleTokenContract<WalletUnlocked>,
    implementation_contract_id: Bech32ContractId,
    to: Bits256,
    amount: u64,
    gas: u64,
) -> CallResponse<()> {
    let tx_policies = TxPolicies::new(Some(0), None, Some(0), None, Some(gas));
    let contract_id = contract.contract_id();
    let asset_id = get_asset_id(contract_id, BRIDGED_TOKEN);
    let call_params = CallParameters::new(amount, asset_id, gas);

    contract
        .methods()
        .withdraw(to)
        .with_contract_ids(&[implementation_contract_id])
        .with_tx_policies(tx_policies)
        .call_params(call_params)
        .expect("Call param Error")
        .call()
        .await
        .unwrap()
}
