use std::collections::HashMap;

use fuel_core_interfaces::common::prelude::Word;
use fuels::prelude::*;
use fuels::tx::{Address, Bytes32, Input, Output, Script, Transaction};

const CONTRACT_MESSAGE_GAS_LIMIT: u64 = 1_200_000;

/// Build a message-to-contract transaction with the given input coins and outputs
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_contract_message_tx(
    message: Input,
    inputs: &[Input],
    outputs: &[Output],
    params: TxParameters,
) -> Script {
    // Get the script and predicate for contract messages
    let script_bytecode = contract_message_predicate::script_bytecode();

    // Start building list of inputs and outputs
    let mut tx_outputs: Vec<Output> = outputs.to_vec();
    let mut tx_inputs: Vec<Input> = vec![message];

    // Loop through inputs and add to lists
    let mut change = HashMap::new();
    for input in inputs {
        match input {
            Input::CoinSigned {
                asset_id, owner, ..
            }
            | Input::CoinPredicate {
                asset_id, owner, ..
            } => {
                change.insert(asset_id, owner);
            }
            Input::Contract { .. } => {
                tx_outputs.push(Output::Contract {
                    input_index: tx_inputs.len() as u8,
                    balance_root: Bytes32::zeroed(),
                    state_root: Bytes32::zeroed(),
                });
            }
            _ => {
                // do nothing
            }
        }
        tx_inputs.push(input.clone());
    }
    for (asset_id, owner) in change {
        tx_outputs.push(Output::Change {
            to: owner.clone(),
            amount: 0,
            asset_id: asset_id.clone(),
        });
    }

    // Add variable output
    tx_outputs.push(Output::Variable {
        to: Address::default(),
        amount: Word::default(),
        asset_id: AssetId::default(),
    });

    // Create the trnsaction
    Transaction::script(
        params.gas_price,
        CONTRACT_MESSAGE_GAS_LIMIT,
        params.maturity,
        script_bytecode,
        vec![],
        tx_inputs,
        tx_outputs,
        vec![],
    )
}
