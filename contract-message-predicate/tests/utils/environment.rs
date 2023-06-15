use crate::builder;

use std::{mem::size_of, num::ParseIntError, str::FromStr, vec};

use fuels::{
    accounts::{fuel_crypto::SecretKey, wallet::WalletUnlocked, Signer},
    prelude::{
        abigen, setup_custom_assets_coins, Address, AssetConfig, AssetId, Contract,
        LoadConfiguration, Provider, ScriptTransaction, TxParameters,
    },
    test_helpers::{setup_single_message, setup_test_client},
    tx::{Bytes32, Receipt},
    types::{
        coin_type::CoinType, input::Input, message::Message, unresolved_bytes::UnresolvedBytes,
    },
};

use fuel_tx::{ConsensusParameters, TxPointer, UtxoId, Word};

abigen!(Contract(
    name = "TestContract",
    abi = "./contract-message-predicate/out/debug/contract_message_test-abi.json"
));

pub const MESSAGE_SENDER_ADDRESS: &str =
    "0xca400d3e7710eee293786830755278e6d2b9278b4177b8b1a896ebd5f55c10bc";
pub const TEST_RECEIVER_CONTRACT_BINARY: &str = "./out/debug/contract_message_test.bin";

/// Sets up a test fuel environment with a funded wallet
pub async fn setup_environment(
    coins: Vec<(Word, AssetId)>,
    messages: Vec<(Word, Vec<u8>)>,
) -> (
    WalletUnlocked,
    TestContract<WalletUnlocked>,
    Input,
    Vec<Input>,
    Vec<Input>,
) {
    // Create secret for wallet
    const SIZE_SECRET_KEY: usize = size_of::<SecretKey>();
    const PADDING_BYTES: usize = SIZE_SECRET_KEY - size_of::<u64>();
    let mut secret_key: [u8; SIZE_SECRET_KEY] = [0; SIZE_SECRET_KEY];
    secret_key[PADDING_BYTES..].copy_from_slice(&(8320147306839812359u64).to_be_bytes());

    // Generate wallet
    let mut wallet = WalletUnlocked::new_from_private_key(
        SecretKey::try_from(secret_key.as_slice())
            .expect("This should never happen as we provide a [u8; SIZE_SECRET_KEY] array"),
        None,
    );

    // Generate coins for wallet
    let asset_configs: Vec<AssetConfig> = coins
        .iter()
        .map(|coin| AssetConfig {
            id: coin.1,
            num_coins: 1,
            coin_amount: coin.0,
        })
        .collect();
    let all_coins = setup_custom_assets_coins(wallet.address(), &asset_configs[..]);

    // Generate messages
    let message_sender = Address::from_str(MESSAGE_SENDER_ADDRESS).unwrap();
    let predicate_bytecode = fuel_contract_message_predicate::predicate_bytecode();
    let predicate_root = Address::from(fuel_contract_message_predicate::predicate_root(
        &ConsensusParameters::default(),
    ));

    let all_messages: Vec<Message> = messages
        .iter()
        .enumerate()
        .flat_map(|(counter, message)| {
            vec![setup_single_message(
                &message_sender.into(),
                &predicate_root.into(),
                message.0,
                (counter as u64).into(),
                message.1.clone(),
            )]
        })
        .collect();

    // Create the client and provider
    let (client, _, consensus_params) =
        setup_test_client(all_coins.clone(), all_messages.clone(), None, None).await;
    let provider = Provider::new(client, consensus_params);

    // Add provider to wallet
    wallet.set_provider(provider);

    // Deploy the target contract used for testing processing messages
    let test_contract_id =
        Contract::load_from(TEST_RECEIVER_CONTRACT_BINARY, LoadConfiguration::default())
            .unwrap()
            .deploy(&wallet, TxParameters::default())
            .await
            .unwrap();

    let test_contract = TestContract::new(test_contract_id.clone(), wallet.clone());

    // Build inputs for provided coins
    let coin_inputs: Vec<Input> = all_coins
        .into_iter()
        .map(|coin| Input::resource_signed(CoinType::Coin(coin), 0))
        .collect();

    // Build inputs for provided messages
    let message_inputs: Vec<Input> = all_messages
        .into_iter()
        .map(|message| {
            Input::resource_predicate(
                CoinType::Message(message),
                predicate_bytecode.clone(),
                UnresolvedBytes::default(),
            )
        })
        .collect();

    // Build contract inputs
    let contract_input = Input::Contract {
        utxo_id: UtxoId::new(Bytes32::zeroed(), 0u8),
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
        tx_pointer: TxPointer::default(),
        contract_id: test_contract_id.into(),
    };

    (
        wallet,
        test_contract,
        contract_input,
        coin_inputs,
        message_inputs,
    )
}

/// Relays a message-to-contract message
pub async fn relay_message_to_contract(
    wallet: &WalletUnlocked,
    message: Input,
    contract: Input,
    gas_coin: Input,
) -> Vec<Receipt> {
    // Build transaction
    let (mut tx, _, _) = builder::build_contract_message_tx(
        message,
        &vec![contract, gas_coin],
        &[],
        TxParameters::default(),
    )
    .await;

    // Sign transaction and call
    sign_and_call_tx(wallet, &mut tx).await
}

/// Relays a message-to-contract message
pub async fn sign_and_call_tx(wallet: &WalletUnlocked, tx: &mut ScriptTransaction) -> Vec<Receipt> {
    // Get provider and client
    let provider = wallet.provider().unwrap();

    // Sign transaction and call
    wallet.sign_transaction(tx).unwrap();
    provider.send_transaction(tx).await.unwrap()
}

/// Prefixes the given bytes with the test contract ID
pub async fn prefix_contract_id(mut data: Vec<u8>) -> Vec<u8> {
    // Compute the test contract ID
    let test_contract_id =
        Contract::load_from(TEST_RECEIVER_CONTRACT_BINARY, LoadConfiguration::default())
            .unwrap()
            .contract_id();

    // Turn contract id into array with the given data appended to it
    let mut test_contract_id = test_contract_id.to_vec();
    test_contract_id.append(&mut data);
    test_contract_id
}

/// Quickly converts the given hex string into a u8 vector
pub fn decode_hex(s: &str) -> Vec<u8> {
    let data: core::result::Result<Vec<u8>, ParseIntError> = (2..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16))
        .collect();
    data.unwrap()
}

/// Constructs test message data
pub async fn message_data(word: u64, bytes: &str, address: &str) -> Vec<u8> {
    let mut message_data = word.to_be_bytes().to_vec();
    message_data.append(&mut decode_hex(bytes));
    message_data.append(&mut decode_hex(address));
    prefix_contract_id(message_data).await
}
