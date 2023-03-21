use crate::utils::builder;

use std::mem::size_of;
use std::num::ParseIntError;
use std::result::Result as StdResult;
use std::str::FromStr;

use fuels::signers::fuel_crypto::SecretKey;
use fuels::test_helpers::{setup_single_message, setup_test_client, Config, DEFAULT_COIN_AMOUNT};
use fuels::tx::{
    Address, AssetId, Bytes32, ConsensusParameters, Input, Output, Receipt, TxPointer, UtxoId, Word,
};
use fuels::{
    prelude::*,
    types::{message::Message, Bits256},
};
use primitive_types::U256 as Unsigned256;

const CONTRACT_MESSAGE_PREDICATE_BINARY: &str =
    "../bridge-message-predicates/contract_message_predicate.bin";

pub struct TestConfig {
    pub adjustment_factor: Unsigned256,
    pub adjustment_is_div: bool,
    pub min_amount: Unsigned256,
    pub max_amount: Unsigned256,
    pub test_amount: Unsigned256,
    pub not_enough: Unsigned256,
    pub overflow_1: Unsigned256,
    pub overflow_2: Unsigned256,
    pub overflow_3: Unsigned256,
}

pub fn generate_test_config(decimals: (u8, u8)) -> TestConfig {
    let bridged_token_decimals = Unsigned256::from(decimals.0);
    let proxy_token_decimals = Unsigned256::from(decimals.1);
    let one = Unsigned256::from(1);

    let adjustment_factor = if bridged_token_decimals > proxy_token_decimals {
        Unsigned256::from(10).pow(bridged_token_decimals - proxy_token_decimals)
    } else if bridged_token_decimals < proxy_token_decimals {
        Unsigned256::from(10).pow(proxy_token_decimals - bridged_token_decimals)
    } else {
        one
    };

    let adjustment_is_div = bridged_token_decimals < proxy_token_decimals;

    let min_amount = if bridged_token_decimals > proxy_token_decimals {
        Unsigned256::from(1) * adjustment_factor
    } else {
        one
    };

    let max_amount = if bridged_token_decimals > proxy_token_decimals {
        Unsigned256::from(u64::MAX) * adjustment_factor
    } else if bridged_token_decimals < proxy_token_decimals {
        Unsigned256::from(u64::MAX) / adjustment_factor
    } else {
        one
    };

    let test_amount = (min_amount + max_amount) / Unsigned256::from(2);
    let not_enough = min_amount - one;
    let overflow_1 = max_amount + one;
    let overflow_2 = max_amount + (one << 160);
    let overflow_3 = max_amount + (one << 224);

    TestConfig {
        adjustment_factor,
        adjustment_is_div,
        min_amount,
        test_amount,
        max_amount,
        not_enough,
        overflow_1,
        overflow_2,
        overflow_3,
    }
}

pub fn fuel_side_equivalent_amount(test_amount: Unsigned256, config: &TestConfig) -> u64 {
    if config.adjustment_is_div {
        (test_amount * config.adjustment_factor).as_u64()
    } else {
        (test_amount / config.adjustment_factor).as_u64()
    }
}

abigen!(
    Contract(
        name = "BridgeFungibleTokenContract",
        abi = "./bridge-fungible-token/out/debug/bridge_fungible_token-abi.json",
    ),
    Predicate(
        name = "ContractMessagePredicate",
        abi = "./bridge-message-predicates/contract_message_predicate-abi.json"
    ),
    Script(
        name = "ContractMessageScript",
        abi = "./bridge-message-predicates/contract_message_script-abi.json",
    ),
);

pub const MESSAGE_SENDER_ADDRESS: &str =
    "0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe";
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
    configurables: Option<BridgeFungibleTokenContractConfigurables>,
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

    let predicate = ContractMessagePredicate::load_from(CONTRACT_MESSAGE_PREDICATE_BINARY).unwrap();
    let predicate_root = predicate.address();

    let mut all_messages: Vec<Message> = vec![];
    for msg in messages {
        all_messages.push(setup_single_message(
            &message_sender.into(),
            &predicate_root,
            msg.0,
            message_nonce,
            msg.1.clone(),
        ))
    }

    // Create the client and provider
    let provider_config = Config::local_node();
    let consensus_parameters_config = ConsensusParameters::DEFAULT.with_max_gas_per_tx(600_000_000);

    let (client, _) = setup_test_client(
        all_coins.clone(),
        all_messages.clone(),
        Some(provider_config),
        None,
        Some(consensus_parameters_config),
    )
    .await;
    let provider = Provider::new(client);

    // Add provider to wallet
    wallet.set_provider(provider.clone());

    let test_contract_id = match configurables {
        Some(config) => Contract::deploy(
            TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
            &wallet,
            DeployConfiguration::default().set_configurables(config),
        )
        .await
        .unwrap(),
        None => Contract::deploy(
            TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
            &wallet,
            DeployConfiguration::default(),
        )
        .await
        .unwrap(),
    };

    let test_contract = BridgeFungibleTokenContract::new(test_contract_id.clone(), wallet.clone());

    // Build inputs for provided coins
    let coin_inputs: Vec<Input> = all_coins
        .into_iter()
        .map(|coin| Input::CoinSigned {
            utxo_id: UtxoId::from(coin.utxo_id.clone()),
            owner: Address::from(coin.owner.clone()),
            amount: coin.amount.clone().into(),
            asset_id: AssetId::from(coin.asset_id.clone()),
            tx_pointer: TxPointer::default(),
            witness_index: 0,
            maturity: 0,
        })
        .collect();

    // Build inputs for provided messages
    let message_inputs: Vec<Input> = all_messages
        .iter()
        .map(|message| Input::MessagePredicate {
            message_id: message.message_id(),
            sender: Address::from(message.sender.clone()),
            recipient: Address::from(message.recipient.clone()),
            amount: message.amount,
            nonce: message.nonce,
            data: message.data.clone(),
            predicate: predicate.code().clone(),
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
pub async fn sign_and_call_tx(wallet: &WalletUnlocked, tx: &mut ScriptTransaction) -> Vec<Receipt> {
    // Get provider and client
    let provider = wallet.get_provider().unwrap();

    // Sign transaction and call
    wallet.sign_transaction(tx).await.unwrap();
    provider.send_transaction(tx).await.unwrap()
}

/// Prefixes the given bytes with the test contract ID
pub async fn prefix_contract_id(data: Vec<u8>) -> Vec<u8> {
    // Compute the test contract ID
    let compiled_contract = Contract::load_contract(
        TEST_BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
        DeployConfiguration::default(),
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
    let data: StdResult<Vec<u8>, ParseIntError> = (2..s.len())
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
        DeployConfiguration::default(),
    )
    .await
    .unwrap();

    let fungible_token_instance =
        BridgeFungibleTokenContract::new(fungible_token_contract_id.clone(), wallet);

    (fungible_token_instance, fungible_token_contract_id.into())
}

pub fn encode_hex(val: Unsigned256) -> [u8; 32] {
    let mut arr = [0u8; 32];
    val.to_big_endian(&mut arr);
    arr
}

pub async fn construct_msg_data(
    token: &str,
    from: &str,
    mut to: Vec<u8>,
    amount: Unsigned256,
) -> ((u64, Vec<u8>), (u64, AssetId)) {
    let mut message_data = Vec::with_capacity(5);
    message_data.append(&mut decode_hex(&token));
    message_data.append(&mut decode_hex(&from));
    message_data.append(&mut to);
    message_data.append(&mut encode_hex(amount).to_vec());

    let message_data = prefix_contract_id(message_data).await;
    let message = (100, message_data);
    let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());

    (message, coin)
}

pub fn generate_variable_output() -> Vec<Output> {
    vec![Output::variable(Address::zeroed(), 0, AssetId::default())]
}

pub fn parse_output_message_data(data: &[u8]) -> (Vec<u8>, Bits256, Bits256, Unsigned256) {
    let selector = &data[0..4];
    let to: [u8; 32] = data[4..36].try_into().unwrap();
    let token_array: [u8; 32] = data[36..68].try_into().unwrap();
    let token = Bits256(token_array);
    let amount_array: [u8; 32] = data[68..100].try_into().unwrap();
    let amount: Unsigned256 = Unsigned256::from_big_endian(&amount_array.to_vec());
    (selector.to_vec(), Bits256(to), token, amount)
}
