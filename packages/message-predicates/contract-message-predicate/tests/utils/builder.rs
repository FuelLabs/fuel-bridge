use std::collections::HashMap;

use fuel_asm::Word;
use fuel_core_types::{
    fuel_tx::Output,
    fuel_types::{Address, AssetId, Bytes32},
};

use fuel_tx::output::contract::Contract;
use fuels::{
    accounts::wallet::WalletUnlocked,
    prelude::{ScriptTransaction, TxPolicies},
    types::{
        coin::Coin,
        coin_type::CoinType,
        input::Input,
        transaction_builders::{
            BuildableTransaction, ScriptTransactionBuilder, TransactionBuilder,
        },
    },
};

/// Build a message-to-contract transaction with the given input coins and outputs
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_contract_message_tx(
    message: Input,
    inputs: &[Input],
    outputs: &[Output],
    wallet: &WalletUnlocked,
) -> ScriptTransaction {
    // Get the script and predicate for contract messages
    let script_bytecode = fuel_contract_message_predicate::script_bytecode();
    let provider = wallet.provider().expect("Needs provider");
    // Start building list of inputs and outputs
    let mut tx_outputs: Vec<Output> = outputs.to_vec();
    let mut tx_inputs: Vec<Input> = vec![message];
    // Loop through inputs and add to lists
    let mut change = HashMap::new();

    let fetched_gas_coins: Vec<Coin> = provider
        .get_coins(wallet.address(), Default::default())
        .await
        .unwrap();

    let funding_utx0 = fetched_gas_coins.first().unwrap().to_owned();
    tx_inputs.push(Input::resource_signed(CoinType::Coin(funding_utx0.clone())));
    tx_outputs.push(Output::Change {
        to: wallet.address().into(),
        amount: funding_utx0.amount,
        asset_id: funding_utx0.asset_id,
    });

    for input in inputs {
        match input {
            Input::ResourcePredicate {
                resource: CoinType::Coin(coin),
                ..
            } => {
                change.insert(coin.asset_id, coin.owner.clone());
            }
            Input::Contract { .. } => {
                let contract_output = Contract {
                    input_index: tx_inputs.len() as u16,
                    balance_root: Bytes32::zeroed(),
                    state_root: Bytes32::zeroed(),
                };

                tx_outputs.push(Output::Contract(contract_output));
            }
            _ => {}
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

    let tx_policies = TxPolicies::new(Some(0), None, None, None, Some(300_000));

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

/// Build a message-to-contract transaction with the given input coins and outputs, but invalid script bytecode
/// note: unspent gas is returned to the owner of the first given gas input
pub async fn build_invalid_contract_message_tx(
    message: Input,
    inputs: &[Input],
    outputs: &[Output],
    wallet: &WalletUnlocked,
) -> ScriptTransaction {
    let invalid_script_bytecode = vec![0u8, 1u8, 2u8, 3u8];
    let provider = wallet.provider().expect("Needs provider");
    // Start building list of inputs and outputs
    let mut tx_outputs: Vec<Output> = outputs.to_vec();
    let mut tx_inputs: Vec<Input> = vec![message];
    // Loop through inputs and add to lists
    let mut change = HashMap::new();

    let mut fetched_gas_coins: Vec<Input> = provider
        .get_coins(wallet.address(), Default::default())
        .await
        .unwrap()
        .iter()
        .map(|el| Input::resource_signed(fuels::types::coin_type::CoinType::Coin(el.clone())))
        .collect();

    tx_inputs.append(&mut fetched_gas_coins);

    for input in inputs {
        match input {
            Input::ResourceSigned { resource, .. } | Input::ResourcePredicate { resource, .. } => {
                if let CoinType::Coin(coin) = resource {
                    change.insert(coin.asset_id, coin.owner.clone());
                }
            }
            Input::Contract { .. } => {
                let contract_output = Contract {
                    input_index: tx_inputs.len() as u16,
                    balance_root: Bytes32::zeroed(),
                    state_root: Bytes32::zeroed(),
                };

                tx_outputs.push(Output::Contract(contract_output));
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

    let tx_policies = TxPolicies::new(Some(0), None, None, None, Some(30_000));
    let mut builder = ScriptTransactionBuilder::default()
        .with_inputs(tx_inputs.clone())
        .with_outputs(tx_outputs.clone())
        .with_tx_policies(tx_policies)
        .with_script(invalid_script_bytecode);

    builder
        .add_signer(wallet.clone())
        .expect("Could not add signer");

    builder.build(provider).await.unwrap()
}
