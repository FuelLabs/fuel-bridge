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
        transaction_builders::{NetworkInfo, ScriptTransactionBuilder, TransactionBuilder},
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
    params: TxParameters,
    network_info: NetworkInfo,
    wallet: &WalletUnlocked,
) -> ScriptTransaction {
    // Get the script and predicate for contract messages
    let script_bytecode = std::fs::read(CONTRACT_MESSAGE_SCRIPT_BINARY).unwrap();
    let number_of_contracts = contracts.len();
    let mut tx_inputs: Vec<Input> = Vec::with_capacity(1 + number_of_contracts + gas_coins.len());
    let mut tx_outputs: Vec<Output> = Vec::new();

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

    // Append provided outputs
    tx_outputs.append(&mut optional_outputs.to_vec());

    let mut builder = ScriptTransactionBuilder::new(network_info)
        .with_inputs(tx_inputs.clone())
        .with_outputs(tx_outputs.clone())
        .with_tx_params(params)
        .with_script(script_bytecode);

    wallet.sign_transaction(&mut builder);

    builder.build().unwrap()
}
