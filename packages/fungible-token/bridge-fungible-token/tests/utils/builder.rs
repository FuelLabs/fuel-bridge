use fuel_core_types::{fuel_tx::{input::{Input}, Bytes32, Output, Transaction}};
/**
 * TODO: This module contains functions that should eventually
 * be made part of the fuels-rs sdk repo as part of the Provider
 * implementation, similar to functions like 'build_transfer_tx'
 */
use fuels::{prelude::*, types::{transaction_builders::{NetworkInfo, ScriptTransactionBuilder, TransactionBuilder}, coin::{Coin, CoinStatus}, tx_status::TxStatus, message::{MessageStatus, Message}}, accounts::predicate::Predicate};
use fuels::types::input::Input as FuelsInput;

use super::constants::CONTRACT_MESSAGE_PREDICATE_BINARY;

const CONTRACT_MESSAGE_MIN_GAS: u64 = 10_000_000;
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
    wallet: &WalletUnlocked
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
        match gas_coins[0].clone() {
            Input::CoinSigned(coin) => {
                tx_outputs.push(Output::change(coin.owner, 0, AssetId::default()));
            }
            Input::CoinPredicate(predicate) => {
                tx_outputs.push(Output::change(predicate.owner, 0, AssetId::default()));
            }
            _ => {
                // do nothing
            }
        }

        // Append provided inputs
        tx_inputs.append(&mut gas_coins.to_vec());
    }

    // Append provided outputs
    tx_outputs.append(&mut optional_outputs.to_vec());

    let tx_inputs: Vec<FuelsInput> = tx_inputs.iter().map(|input| {
        let fuel_input: FuelsInput = match input {
            Input::CoinSigned(coin_signed) => {
                let resource = Coin { amount: coin_signed.amount, block_created: 0, asset_id: coin_signed.asset_id, utxo_id: coin_signed.utxo_id, maturity: 0, owner: coin_signed.owner.into(), status: CoinStatus::Unspent };
                FuelsInput::resource_signed(fuels::types::coin_type::CoinType::Coin(resource))
            } 
            Input::MessageDataPredicate(msg_predicate) => {
                let resource = Message { amount: msg_predicate.amount, sender: msg_predicate.sender.into(), recipient: msg_predicate.recipient.into(), nonce: msg_predicate.nonce, data: msg_predicate.data.clone(), da_height: 0, status: MessageStatus::Unspent};
                FuelsInput::resource_predicate(fuels::types::coin_type::CoinType::Message(resource), msg_predicate.predicate.clone(), Default::default())
            },
            Input::Contract(contract) => {
                FuelsInput::contract(contract.utxo_id.clone(), contract.balance_root.clone(), contract.state_root.clone(), contract.tx_pointer.clone(), contract.contract_id.clone())
            }, 
            Input::CoinPredicate(_) => todo!(),
            Input::MessageCoinSigned(_) => todo!(),
            Input::MessageCoinPredicate(_) => todo!(),
            Input::MessageDataSigned(_) => todo!(),
        };

        fuel_input
    }).collect();

    let mut builder = ScriptTransactionBuilder::new(network_info)
        .with_inputs(tx_inputs.clone())
        .with_outputs(tx_outputs.clone())
        .with_tx_params(params)
        .with_script(script_bytecode);

    wallet.sign_transaction(&mut builder);

    builder.build().unwrap()
}
