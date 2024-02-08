use fuels::{
    accounts::{provider::Provider, wallet::WalletUnlocked, Account},
    tx::Bytes32,
    types::{
        transaction::TxPolicies,
        transaction_builders::{BuildableTransaction, ScriptTransactionBuilder},
    },
};

use super::constants::{get_wallet_by_name, AccountName};

pub async fn send_funds(
    provider: &Provider,
    from: Option<WalletUnlocked>,
    to: Option<WalletUnlocked>,
    commit: bool,
) -> anyhow::Result<Bytes32> {
    let alice = from.unwrap_or(get_wallet_by_name(
        AccountName::Alice,
        Some(provider.clone()),
    ));
    let bob = to.unwrap_or(get_wallet_by_name(AccountName::Bob, None));

    let amount = 100u64;
    let asset_id = Default::default();
    let tx_policies: TxPolicies = Default::default();
    let network_info = provider.network_info().await?;
    let inputs = alice.get_asset_inputs_for_amount(asset_id, amount).await?;
    let outputs = alice.get_asset_outputs_for_amount(bob.address(), asset_id, amount);

    let mut tx_builder =
        ScriptTransactionBuilder::prepare_transfer(inputs, outputs, tx_policies, network_info);

    alice.add_witnessses(&mut tx_builder);
    alice.adjust_for_fee(&mut tx_builder, amount).await?;

    let tx = tx_builder.build(provider).await?;

    let tx_id: Bytes32 = if commit {
        provider.send_transaction_and_await_commit(tx).await?
    } else {
        provider.send_transaction(tx).await?
    };

    Ok(tx_id)
}
