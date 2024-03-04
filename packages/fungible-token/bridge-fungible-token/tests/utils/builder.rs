use fuel_core_types::fuel_tx::{Bytes32, Output};
/**
 * TODO: This module contains functions that should eventually
 * be made part of the fuels-rs sdk repo as part of the Provider
 * implementation, similar to functions like 'build_transfer_tx'
 */
use fuels::{
    prelude::*,
    types::{
        input::Input,
        transaction_builders::{ScriptTransactionBuilder, TransactionBuilder},
    },
};

const CONTRACT_MESSAGE_SCRIPT_BINARY: &str =
    "../../message-predicates/contract-message-predicate/out/contract_message_script.bin";

/// Build a message-to-contract transaction with the given input coins and outputs
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_contract_message_tx(
    message: Input,
    contracts: Vec<Input>,
    gas_coins: &[Input],
    optional_outputs: &[Output],
    tx_policies: TxPolicies,
    wallet: &WalletUnlocked,
) -> ScriptTransaction {
    // Get the script and predicate for contract messages
    let script_bytecode = std::fs::read(CONTRACT_MESSAGE_SCRIPT_BINARY).unwrap();
    let number_of_contracts = contracts.len();
    let mut tx_inputs: Vec<Input> = Vec::with_capacity(1 + number_of_contracts + gas_coins.len());
    let mut tx_outputs: Vec<Output> = Vec::new();
    let provider = wallet
        .provider()
        .expect("Need to attach a provider to the wallet");

    // Start building tx list of inputs
    tx_inputs.push(message);
    for contract in contracts {
        tx_inputs.push(contract);
    }

    // Start building tx list of outputs
    tx_outputs.push(Output::contract(1u8, Bytes32::zeroed(), Bytes32::zeroed()));

    // If there is more than 1 contract input, it means this is a deposit to contract.
    if number_of_contracts > 1usize {
        tx_outputs.push(Output::contract(2u8, Bytes32::zeroed(), Bytes32::zeroed()));
    };

    // Build a change output for the owner of the first provided coin input
    if !gas_coins.is_empty() {
        // Append provided inputs
        tx_inputs.append(&mut gas_coins.to_vec());
    }

    // When funding the transaction with gas_coins, we need return the change of the UTXO
    // back to the wallet
    for gas_coin in gas_coins {
        if let Input::ResourceSigned { resource } = gas_coin {
            tx_outputs.push(Output::Change {
                to: wallet.address().into(),
                amount: 0,
                asset_id: resource.asset_id(),
            });
        }
    }

    // Append provided outputs
    tx_outputs.append(&mut optional_outputs.to_vec());

    let mut builder = ScriptTransactionBuilder::default()
        .with_inputs(tx_inputs.clone())
        .with_outputs(tx_outputs.clone())
        .with_tx_policies(tx_policies)
        .with_script(script_bytecode);

    builder
        .add_signer(wallet.clone())
        .expect("Could not add signer");

    builder.build(provider).await.unwrap()
}
