use std::collections::HashMap;

use fuel_tx::{Address, AssetId, Output};
use fuels::{
    accounts::{fuel_crypto::fuel_types::Word, wallet::WalletUnlocked, Signer},
    prelude::{ScriptTransaction, TxParameters},
    tx::Bytes32,
    types::{
        coin_type::CoinType,
        input::Input,
        transaction_builders::{NetworkInfo, ScriptTransactionBuilder, TransactionBuilder},
    },
};

/// Build a message-to-contract transaction with the given input coins and outputs
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_contract_message_tx(
    message: Input,
    inputs: &[Input],
    outputs: &[Output],
    params: TxParameters,
    network_info: NetworkInfo,
    wallet: &WalletUnlocked,
) -> ScriptTransaction {
    // Get the script and predicate for contract messages
    let script_bytecode = fuel_contract_message_predicate::script_bytecode();
    // Start building list of inputs and outputs
    let mut tx_outputs: Vec<Output> = outputs.to_vec();
    let mut tx_inputs: Vec<Input> = vec![message];
    // Loop through inputs and add to lists
    let mut change = HashMap::new();
    for input in inputs {
        match input {
            Input::ResourceSigned { resource, .. } | Input::ResourcePredicate { resource, .. } => {
                if let CoinType::Coin(coin) = resource {
                    change.insert(coin.asset_id, coin.owner.clone());
                }
            }
            Input::Contract { .. } => {
                tx_outputs.push(Output::Contract {
                    input_index: tx_inputs.len() as u8,
                    balance_root: Bytes32::zeroed(),
                    state_root: Bytes32::zeroed(),
                });
            }
        }
        tx_inputs.push(input.clone());
    }
    for (asset_id, owner) in change {
        tx_outputs.push(Output::Change {
            to: owner.clone().into(),
            amount: 0,
            asset_id,
        });
    }
    // Add variable output
    tx_outputs.push(Output::Variable {
        to: Address::default(),
        amount: Word::default(),
        asset_id: AssetId::default(),
    });

    let mut builder = ScriptTransactionBuilder::new(network_info)
        .with_inputs(tx_inputs.clone())
        .with_outputs(tx_outputs.clone())
        .with_tx_params(params)
        .with_script(script_bytecode);

    wallet.sign_transaction(&mut builder);

    builder.build().unwrap()
}

/// Build a message-to-contract transaction with the given input coins and outputs, but invalid script bytecode
/// note: unspent gas is returned to the owner of the first given gas input
/// Build a message-to-contract transaction with the given input coins and outputs
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_invalid_contract_message_tx(
    message: Input,
    inputs: &[Input],
    outputs: &[Output],
    params: TxParameters,
    network_info: NetworkInfo,
    wallet: &WalletUnlocked,
) -> ScriptTransaction {
    // Start building list of inputs and outputs
    let mut tx_outputs: Vec<Output> = outputs.to_vec();
    let mut tx_inputs: Vec<Input> = vec![message];
    // Loop through inputs and add to lists
    let mut change = HashMap::new();
    for input in inputs {
        match input {
            Input::ResourceSigned { resource, .. } | Input::ResourcePredicate { resource, .. } => {
                if let CoinType::Coin(coin) = resource {
                    change.insert(coin.asset_id, coin.owner.clone());
                }
            }
            Input::Contract { .. } => {
                tx_outputs.push(Output::Contract {
                    input_index: tx_inputs.len() as u8,
                    balance_root: Bytes32::zeroed(),
                    state_root: Bytes32::zeroed(),
                });
            }
        }
        tx_inputs.push(input.clone());
    }
    for (asset_id, owner) in change {
        tx_outputs.push(Output::Change {
            to: owner.clone().into(),
            amount: 0,
            asset_id,
        });
    }
    // Add variable output
    tx_outputs.push(Output::Variable {
        to: Address::default(),
        amount: Word::default(),
        asset_id: AssetId::default(),
    });

    let mut builder = ScriptTransactionBuilder::new(network_info)
        .with_inputs(tx_inputs.clone())
        .with_outputs(tx_outputs.clone())
        .with_tx_params(params)
        .with_script(vec![0u8, 1u8, 2u8, 3u8]);

    wallet.sign_transaction(&mut builder);

    builder.build().unwrap()
}
