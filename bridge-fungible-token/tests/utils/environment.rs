use crate::builder;

use std::mem::size_of;
use std::num::ParseIntError;
use std::str::FromStr;

use fuel_core_interfaces::model::Message;
use fuels::contract::script::Script;
use fuels::prelude::*;
use fuels::signers::fuel_crypto::SecretKey;
use fuels::test_helpers::{setup_single_message, setup_test_client, Config, DEFAULT_COIN_AMOUNT};
use fuels::tx::Output;
use fuels::tx::Receipt;
use fuels::tx::Transaction;
use fuels::tx::{Address, AssetId, Bytes32, Input, TxPointer, UtxoId, Word};

abigen!(
    BridgeFungibleTokenContract,
    "../bridge-fungible-token/out/debug/bridge_fungible_token-abi.json"
);

pub const MESSAGE_SENDER_ADDRESS: &str =
    "0xca400d3e7710eee293786830755278e6d2b9278b4177b8b1a896ebd5f55c10bc";
pub const TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY: &str =
    "../bridge-fungible-token/out/debug/bridge_fungible_token.bin";

pub fn setup_wallet() -> WalletUnlocked {
    // Create secret for wallet
    const SIZE_SECRET_KEY: usize = size_of::<SecretKey>();
    const PADDING_BYTES: usize = SIZE_SECRET_KEY - size_of::<u64>();
    let mut secret_key: [u8; SIZE_SECRET_KEY] = [0; SIZE_SECRET_KEY];
    secret_key[PADDING_BYTES..].copy_from_slice(&(8320147306839812359u64).to_be_bytes());

    // Generate wallet
    let wallet = WalletUnlocked::new_from_private_key(
        SecretKey::try_from(secret_key.as_slice())
            .expect("This should never happen as we provide a [u8; SIZE_SECRET_KEY] array"),
        None,
    );
    wallet
}

/// Sets up a test fuel environment with a funded wallet
pub async fn setup_environment(
    wallet: &mut WalletUnlocked,
    coins: Vec<(Word, AssetId)>,
    messages: Vec<(Word, Vec<u8>)>,
    sender: Option<&str>,
) -> (
    BridgeFungibleTokenContract,
    Input,
    Vec<Input>,
    Vec<Input>,
    Bech32ContractId,
    Provider,
) {
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
    let message_nonce: Word = Word::default();
    let message_sender = match sender {
        Some(v) => Address::from_str(v).unwrap(),
        None => Address::from_str(MESSAGE_SENDER_ADDRESS).unwrap(),
    };
    let (predicate_bytecode, predicate_root) = builder::get_contract_message_predicate().await;
    let all_messages: Vec<Message> = messages
        .iter()
        .flat_map(|message| {
            setup_single_message(
                &message_sender.into(),
                &predicate_root.into(),
                message.0,
                message_nonce,
                message.1.clone(),
            )
        })
        .collect();

    // Create the client and provider
    let mut provider_config = Config::local_node();
    provider_config.predicates = true;
    let (client, _) = setup_test_client(
        all_coins.clone(),
        all_messages.clone(),
        Some(provider_config),
        None,
    )
    .await;
    let provider = Provider::new(client);

    // Add provider to wallet
    wallet.set_provider(provider.clone());

    // Deploy the target contract used for testing processing messages
    let test_contract_id = Contract::deploy(
        TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
        &wallet,
        TxParameters::default(),
        StorageConfiguration::default(),
    )
    .await
    .unwrap();
    let test_contract = BridgeFungibleTokenContract::new(test_contract_id.clone(), wallet.clone());

    // Build inputs for provided coins
    let coin_inputs: Vec<Input> = all_coins
        .into_iter()
        .map(|coin| Input::CoinSigned {
            utxo_id: UtxoId::from(coin.0.clone()),
            owner: Address::from(coin.1.owner.clone()),
            amount: coin.1.amount.clone().into(),
            asset_id: AssetId::from(coin.1.asset_id.clone()),
            tx_pointer: TxPointer::default(),
            witness_index: 0,
            maturity: 0,
        })
        .collect();

    // Build inputs for provided messages
    let message_inputs: Vec<Input> = all_messages
        .iter()
        .map(|message| Input::MessagePredicate {
            message_id: message.id(),
            sender: Address::from(message.sender.clone()),
            recipient: Address::from(message.recipient.clone()),
            amount: message.amount,
            nonce: message.nonce,
            data: message.data.clone(),
            predicate: predicate_bytecode.clone(),
            predicate_data: vec![],
        })
        .collect();

    // Build contract input
    let contract_input = Input::Contract {
        utxo_id: UtxoId::new(Bytes32::zeroed(), 0u8),
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
        tx_pointer: TxPointer::default(),
        contract_id: test_contract_id.clone().into(),
    };

    (
        test_contract,
        contract_input,
        coin_inputs,
        message_inputs,
        test_contract_id,
        provider,
    )
}

/// Relays a message-to-contract message
pub async fn relay_message_to_contract(
    wallet: &WalletUnlocked,
    message: Input,
    contract: Input,
    gas_coins: &[Input],
    optional_inputs: &[Input],
    optional_outputs: &[Output],
) -> Vec<Receipt> {
    // Build transaction
    let mut tx = builder::build_contract_message_tx(
        message,
        contract,
        gas_coins,
        optional_inputs,
        optional_outputs,
        TxParameters::default(),
    )
    .await;

    // Sign transaction and call
    sign_and_call_tx(wallet, &mut tx).await
}

/// Relays a message-to-contract message
pub async fn sign_and_call_tx(wallet: &WalletUnlocked, tx: &mut Transaction) -> Vec<Receipt> {
    // Get provider and client
    let provider = wallet.get_provider().unwrap();

    // Sign transaction and call
    wallet.sign_transaction(tx).await.unwrap();
    let script = Script::new(tx.clone());
    script.call(provider).await.unwrap()
}

/// Prefixes the given bytes with the test contract ID
pub async fn prefix_contract_id(data: Vec<u8>) -> Vec<u8> {
    // Compute the test contract ID
    let storage_configuration = StorageConfiguration::default();
    let compiled_contract = Contract::load_contract(
        TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
        &storage_configuration.storage_path,
    )
    .unwrap();
    let (test_contract_id, _) = Contract::compute_contract_id_and_state_root(&compiled_contract);

    // Turn contract id into array with the given data appended to it
    let test_contract_id: [u8; 32] = test_contract_id.into();
    let mut test_contract_id = test_contract_id.to_vec();
    test_contract_id.append(&mut data.clone());
    test_contract_id
}

/// Quickly converts the given hex string into a u8 vector
pub fn decode_hex(s: &str) -> Vec<u8> {
    let data: Result<Vec<u8>, ParseIntError> = (2..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16))
        .collect();
    data.unwrap()
}

pub async fn get_fungible_token_instance(
    wallet: WalletUnlocked,
) -> (BridgeFungibleTokenContract, ContractId) {
    // Deploy the target contract used for testing processing messages
    let fungible_token_contract_id = Contract::deploy(
        TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
        &wallet,
        TxParameters::default(),
        StorageConfiguration::default(),
    )
    .await
    .unwrap();

    let fungible_token_instance =
        BridgeFungibleTokenContract::new(fungible_token_contract_id.clone(), wallet);

    (fungible_token_instance, fungible_token_contract_id.into())
}

pub async fn construct_msg_data(
    l1_token: &str,
    from: &str,
    mut to: Vec<u8>,
    amount: &str,
) -> ((u64, Vec<u8>), (u64, AssetId)) {
    let mut message_data = Vec::with_capacity(5);
    message_data.append(&mut decode_hex(&l1_token));
    message_data.append(&mut decode_hex(&from));
    message_data.append(&mut to);
    message_data.append(&mut decode_hex(&amount));

    let message_data = prefix_contract_id(message_data).await;
    let message = (100, message_data);
    let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());

    (message, coin)
}

pub fn generate_outputs() -> Vec<Output> {
    let mut v = vec![Output::variable(Address::zeroed(), 0, AssetId::default())];
    v.push(Output::message(Address::zeroed(), 0));
    v
}

pub fn parse_output_message_data(data: &[u8]) -> (Vec<u8>, Bits256, Bits256, u64) {
    let selector = &data[4..8];
    let to: [u8; 32] = data[8..40].try_into().unwrap();
    let token_array: [u8; 32] = data[40..72].try_into().unwrap();
    let l1_token = Bits256(token_array);
    let amount_array: [u8; 8] = data[96..].try_into().unwrap();
    let amount: u64 = u64::from_be_bytes(amount_array);
    (selector.to_vec(), Bits256(to), l1_token, amount)
}

pub fn hex_to_uint_128(hex: &str) -> u128 {
    let trimmed = hex.trim_start_matches("0x");
    u128::from_str_radix(trimmed, 16).unwrap()
}
