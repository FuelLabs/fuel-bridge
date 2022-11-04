use fuels::prelude::*;
use fuels::tx::{
    Address, AssetId, Bytes32, Contract as tx_contract, Input, Output, Script, Transaction, Word,
};

const CONTRACT_MESSAGE_MIN_GAS: u64 = 1_200_000;
const CONTRACT_MESSAGE_SCRIPT_BINARY: &str =
    "../contract-message-script/out/debug/contract_message_script.bin";
const CONTRACT_MESSAGE_PREDICATE_BINARY: &str =
    "../contract-message-predicate/out/debug/contract_message_predicate.bin";

/// Gets the message to contract script
pub async fn get_contract_message_script() -> Vec<u8> {
    let script_bytecode = std::fs::read(CONTRACT_MESSAGE_SCRIPT_BINARY).unwrap();
    script_bytecode
}

/// Gets the message to contract predicate
pub async fn get_contract_message_predicate() -> (Vec<u8>, Address) {
    let predicate_bytecode = std::fs::read(CONTRACT_MESSAGE_PREDICATE_BINARY).unwrap();
    let predicate_root = Address::from(*tx_contract::root_from_code(&predicate_bytecode));
    (predicate_bytecode, predicate_root)
}

/// Build a message-to-contract transaction with the given input coins and outputs
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_contract_message_tx(
    message: Input,
    contract: Input,
    gas_coin: Input,
    optional_inputs: &[Input],
    optional_outputs: &[Output],
    params: TxParameters,
) -> Script {
    // Get the script and predicate for contract messages
    let script_bytecode = get_contract_message_script().await;

    // Start building tx list of outputs
    let mut tx_outputs: Vec<Output> = Vec::new();
    tx_outputs.push(Output::Contract {
        input_index: 0u8,
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
    });

    // Build a change output for the owner of the provided gas coin input
    match gas_coin {
        Input::CoinSigned { owner, .. } | Input::CoinPredicate { owner, .. } => {
            // Add change output
            tx_outputs.push(Output::Change {
                to: owner.clone(),
                amount: 0,
                asset_id: AssetId::default(),
            });
        }
        _ => {
            // do nothing
        }
    }

    // Build variable output
    tx_outputs.push(Output::Variable {
        to: Address::default(),
        amount: Word::default(),
        asset_id: AssetId::default(),
    });

    // Start building tx list of inputs
    let mut tx_inputs: Vec<Input> = Vec::new();
    tx_inputs.push(contract);
    tx_inputs.push(message);
    tx_inputs.push(gas_coin);

    // Append provided inputs and outputs
    tx_inputs.append(&mut optional_inputs.to_vec());
    tx_outputs.append(&mut optional_outputs.to_vec());

    // Create the trnsaction
    Transaction::script(
        params.gas_price,
        CONTRACT_MESSAGE_MIN_GAS,
        params.maturity,
        script_bytecode,
        vec![],
        tx_inputs,
        tx_outputs,
        vec![],
    )
}
