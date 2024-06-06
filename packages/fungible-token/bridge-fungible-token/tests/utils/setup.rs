use crate::utils::{
    builder,
    constants::{
        BRIDGED_TOKEN_DECIMALS, BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
        CONTRACT_MESSAGE_PREDICATE_BINARY, DEPOSIT_RECIPIENT_CONTRACT_BINARY, MESSAGE_AMOUNT,
        MESSAGE_SENDER_ADDRESS,
    },
};
use ethers::abi::Token;
use fuel_core_types::{
    fuel_crypto::{Hasher, SecretKey},
    fuel_tx::{Bytes32, Output, TxId, TxPointer, UtxoId},
    fuel_types::{Nonce, Word},
};

use fuels::{
    accounts::{predicate::Predicate, wallet::WalletUnlocked, ViewOnlyAccount},
    prelude::{
        abigen, launch_provider_and_get_wallet, setup_custom_assets_coins, setup_test_provider,
        Address, AssetConfig, AssetId, Bech32ContractId, Contract, ContractId, LoadConfiguration,
        Provider, TxPolicies,
    },
    programs::contract::StorageConfiguration,
    test_helpers::{setup_single_message, DEFAULT_COIN_AMOUNT},
    tx::StorageSlot,
    types::{coin::Coin, input::Input, message::Message, tx_status::TxStatus, Bits256, U256},
};
use sha2::Digest;
use std::{mem::size_of, num::ParseIntError, result::Result as StdResult, str::FromStr};

use super::constants::{
    BRIDGED_TOKEN, BRIDGED_TOKEN_ID, BRIDGE_PROXY_BINARY, DEPOSIT_TO_ADDRESS_FLAG,
    DEPOSIT_TO_CONTRACT_FLAG, DEPOSIT_WITH_DATA_FLAG, FROM, METADATA_MESSAGE_FLAG,
};

abigen!(
    Contract(
        name = "BridgeFungibleTokenContract",
        abi = "packages/fungible-token/bridge-fungible-token/implementation/out/release/bridge_fungible_token-abi.json",
    ),
    Contract(
        name = "DepositRecipientContract",
        abi =
            "packages/fungible-token/test-deposit-recipient-contract/out/release/test_deposit_recipient_contract-abi.json",
    ),
    Contract(
        name = "BridgeProxy",
        abi = "packages/fungible-token/bridge-fungible-token/proxy/out/release/proxy-abi.json",
    )
);

/// Used for setting up tests with various message values
#[derive(Debug)]
pub struct BridgingConfig {
    pub adjustment: Adjustment,
    pub amount: TxAmount,
    pub overflow: Overflow,
}

#[derive(Debug)]
pub struct Adjustment {
    pub factor: U256,
    pub is_div: bool,
}

#[derive(Debug)]
pub struct TxAmount {
    pub min: U256,
    pub max: U256,
    pub test: U256,
    pub not_enough: U256,
}

#[derive(Debug)]
pub struct Overflow {
    pub one: U256,
    pub two: U256,
    pub three: U256,
}

#[derive(Debug)]
pub struct UTXOInputs {
    pub contract: Vec<Input>,
    pub coin: Vec<Input>,
    pub message: Vec<Input>,
}

impl BridgingConfig {
    pub fn new(bridge_decimals: u64, proxy_decimals: u64) -> Self {
        let bridged_token_decimals = U256::from(bridge_decimals);
        let proxy_token_decimals = U256::from(proxy_decimals);
        let one = U256::from(1);

        let adjustment_factor = match (bridged_token_decimals, proxy_token_decimals) {
            (bridged_token_decimals, proxy_token_decimals)
                if bridged_token_decimals > proxy_token_decimals =>
            {
                U256::from(10).pow(bridged_token_decimals - proxy_token_decimals)
            }
            (bridged_token_decimals, proxy_token_decimals)
                if bridged_token_decimals < proxy_token_decimals =>
            {
                U256::from(10).pow(proxy_token_decimals - bridged_token_decimals)
            }
            _ => one,
        };

        let adjustment_is_div = bridged_token_decimals < proxy_token_decimals;

        let min_amount = if bridged_token_decimals > proxy_token_decimals {
            U256::from(1) * adjustment_factor
        } else {
            one
        };

        let max_amount = match (bridged_token_decimals, proxy_token_decimals) {
            (bridged_token_decimals, proxy_token_decimals)
                if bridged_token_decimals > proxy_token_decimals =>
            {
                U256::from(u64::MAX) * adjustment_factor
            }
            (bridged_token_decimals, proxy_token_decimals)
                if bridged_token_decimals < proxy_token_decimals =>
            {
                U256::from(u64::MAX) / adjustment_factor
            }
            (_, _) => one,
        };

        let test_amount = (min_amount + max_amount) / U256::from(2);
        let not_enough = min_amount - one;
        let overflow_1 = max_amount + one;
        let overflow_2 = max_amount + (one << 160);
        let overflow_3 = max_amount + (one << 224);

        Self {
            adjustment: Adjustment {
                factor: adjustment_factor,
                is_div: adjustment_is_div,
            },
            amount: TxAmount {
                min: min_amount,
                max: max_amount,
                test: test_amount,
                not_enough,
            },
            overflow: Overflow {
                one: overflow_1,
                two: overflow_2,
                three: overflow_3,
            },
        }
    }
}

pub(crate) fn create_wallet() -> WalletUnlocked {
    const SIZE_SECRET_KEY: usize = size_of::<SecretKey>();
    const PADDING_BYTES: usize = SIZE_SECRET_KEY - size_of::<u64>();
    let mut secret_key: [u8; SIZE_SECRET_KEY] = [0; SIZE_SECRET_KEY];
    secret_key[PADDING_BYTES..].copy_from_slice(&(8320147306839812359u64).to_be_bytes());

    let wallet = WalletUnlocked::new_from_private_key(
        SecretKey::try_from(secret_key.as_slice()).unwrap(),
        None,
    );
    wallet
}

/// Sets up a test fuel environment with a funded wallet
pub(crate) async fn setup_environment(
    wallet: &mut WalletUnlocked,
    coins: Vec<(Word, AssetId)>,
    messages: Vec<(Word, Vec<u8>)>,
    deposit_contract: Option<ContractId>,
    sender: Option<&str>,
    configurables: Option<BridgeFungibleTokenContractConfigurables>,
) -> (
    Bech32ContractId,
    BridgeFungibleTokenContract<WalletUnlocked>,
    UTXOInputs,
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

    // Generate message
    let mut message_nonce = Nonce::zeroed();
    let message_sender = match sender {
        Some(v) => Address::from_str(v).unwrap(),
        None => Address::from_str(MESSAGE_SENDER_ADDRESS).unwrap(),
    };

    let predicate = Predicate::load_from(CONTRACT_MESSAGE_PREDICATE_BINARY).unwrap();
    let predicate_root = predicate.address();

    let mut all_messages: Vec<Message> = Vec::with_capacity(messages.len());
    for msg in messages {
        all_messages.push(setup_single_message(
            &message_sender.into(),
            predicate_root,
            msg.0,
            message_nonce,
            msg.1.clone(),
        ));
        message_nonce[0] += 1;
    }

    // Create a provider with the coins and messages
    let provider = setup_test_provider(all_coins.clone(), all_messages.clone(), None, None)
        .await
        .unwrap();

    wallet.set_provider(provider);

    // Set up the bridge contract instance
    let implementation_config = match configurables {
        Some(config) => LoadConfiguration::default().with_configurables(config),
        None => LoadConfiguration::default(),
    };

    let implementation_contract_id =
        Contract::load_from(BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY, implementation_config)
            .unwrap()
            .deploy(&wallet.clone(), TxPolicies::default())
            .await
            .unwrap();

    // let proxy_configurables
    // let proxy_configurables = BridgeProxyConfigurables::default().with_TARGET(implementation_contract_id.clone().into()).unwrap();

    let target_key_hash = Hasher::hash("storage_SRC14_0");
    let slot_override_target = StorageSlot::new(
        target_key_hash,
        (*implementation_contract_id.clone().hash).into(),
    );
    let owner_key_hash = Hasher::hash("storage_SRC14_1");
    let slot_override_owner = StorageSlot::new(owner_key_hash, (*wallet.address().hash).into());

    let storage_configuration = StorageConfiguration::default()
        .add_slot_overrides([slot_override_target, slot_override_owner]);

    let proxy_config =
        LoadConfiguration::default().with_storage_configuration(storage_configuration);
    let proxy_contract_id = Contract::load_from(BRIDGE_PROXY_BINARY, proxy_config)
        .unwrap()
        .deploy(&wallet.clone(), TxPolicies::default())
        .await
        .unwrap();

    let proxy_bridge = BridgeFungibleTokenContract::new(proxy_contract_id.clone(), wallet.clone());

    // Build inputs for provided coins
    let coin_inputs = all_coins
        .into_iter()
        .map(|coin| Input::resource_signed(fuels::types::coin_type::CoinType::Coin(coin)))
        .collect();

    // Build inputs for provided messages
    let message_inputs = all_messages
        .into_iter()
        .map(|message| {
            Input::resource_predicate(
                fuels::types::coin_type::CoinType::Message(message),
                predicate.code().into(),
                Default::default(),
            )
        })
        .collect();

    // Build contract inputs
    let mut contract_inputs = vec![Input::contract(
        UtxoId::new(Bytes32::zeroed(), 0u16),
        Bytes32::zeroed(),
        Bytes32::zeroed(),
        TxPointer::default(),
        proxy_contract_id.into(),
    )];

    contract_inputs.push(Input::contract(
        UtxoId::new(Bytes32::zeroed(), 0u16),
        Bytes32::zeroed(),
        Bytes32::zeroed(),
        TxPointer::default(),
        implementation_contract_id.clone().into(),
    ));

    if let Some(id) = deposit_contract {
        contract_inputs.push(Input::contract(
            UtxoId::new(Bytes32::zeroed(), 0u16),
            Bytes32::zeroed(),
            Bytes32::zeroed(),
            TxPointer::default(),
            id,
        ));
    }

    (
        implementation_contract_id,
        proxy_bridge,
        UTXOInputs {
            contract: contract_inputs,
            coin: coin_inputs,
            message: message_inputs,
        },
    )
}

/// Sets up a test fuel environment with a funded wallet
pub(crate) async fn setup_environment_with_proxy(
    wallet: &mut WalletUnlocked,
    coins: Vec<(Word, AssetId)>,
    messages: Vec<(Word, Vec<u8>)>,
    deposit_contract: Option<ContractId>,
    sender: Option<&str>,
    configurables: Option<BridgeFungibleTokenContractConfigurables>,
) -> (
    BridgeFungibleTokenContract<WalletUnlocked>,
    BridgeFungibleTokenContract<WalletUnlocked>,
    Bech32ContractId,
    UTXOInputs,
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

    // Generate message
    let mut message_nonce = Nonce::zeroed();
    let message_sender = match sender {
        Some(v) => Address::from_str(v).unwrap(),
        None => Address::from_str(MESSAGE_SENDER_ADDRESS).unwrap(),
    };

    let predicate = Predicate::load_from(CONTRACT_MESSAGE_PREDICATE_BINARY).unwrap();
    let predicate_root = predicate.address();

    let mut all_messages: Vec<Message> = Vec::with_capacity(messages.len());
    for msg in messages {
        all_messages.push(setup_single_message(
            &message_sender.into(),
            predicate_root,
            msg.0,
            message_nonce,
            msg.1.clone(),
        ));
        message_nonce[0] += 1;
    }

    // Create a provider with the coins and messages
    let provider = setup_test_provider(all_coins.clone(), all_messages.clone(), None, None)
        .await
        .unwrap();

    wallet.set_provider(provider);

    // Set up the bridge contract instance
    let implementation_config = match configurables {
        Some(config) => LoadConfiguration::default()
            .with_configurables(config)
            .with_storage_configuration(StorageConfiguration::default().with_autoload(false)),
        None => LoadConfiguration::default(),
    };

    let implementation_contract_id =
        Contract::load_from(BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY, implementation_config)
            .unwrap()
            .deploy(&wallet.clone(), TxPolicies::default())
            .await
            .unwrap();

    // let proxy_configurables
    // let proxy_configurables = BridgeProxyConfigurables::default().with_TARGET(implementation_contract_id.clone().into()).unwrap();
    let slot_override_target = StorageSlot::new(
        Bytes32::zeroed(),
        (*implementation_contract_id.clone().hash).into(),
    );
    let key: [u8; 32] = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 1,
    ];
    let slot_override_owner = StorageSlot::new(key.into(), (*wallet.address().hash).into());

    let storage_configuration = StorageConfiguration::default()
        .add_slot_overrides([slot_override_target, slot_override_owner]);

    let proxy_config =
        LoadConfiguration::default().with_storage_configuration(storage_configuration);
    let proxy_contract_id = Contract::load_from(BRIDGE_PROXY_BINARY, proxy_config)
        .unwrap()
        .deploy(&wallet.clone(), TxPolicies::default())
        .await
        .unwrap();

    let bridge = BridgeFungibleTokenContract::new(proxy_contract_id.clone(), wallet.clone());
    let implementation =
        BridgeFungibleTokenContract::new(implementation_contract_id.clone(), wallet.clone());

    // Build inputs for provided coins
    let coin_inputs = all_coins
        .into_iter()
        .map(|coin| Input::resource_signed(fuels::types::coin_type::CoinType::Coin(coin)))
        .collect();

    // Build inputs for provided messages
    let message_inputs = all_messages
        .into_iter()
        .map(|message| {
            Input::resource_predicate(
                fuels::types::coin_type::CoinType::Message(message),
                predicate.code().into(),
                Default::default(),
            )
        })
        .collect();

    // Build contract inputs
    let mut contract_inputs = vec![Input::contract(
        UtxoId::new(Bytes32::zeroed(), 0u16),
        Bytes32::zeroed(),
        Bytes32::zeroed(),
        TxPointer::default(),
        proxy_contract_id.into(),
    )];

    if let Some(id) = deposit_contract {
        contract_inputs.push(Input::contract(
            UtxoId::new(Bytes32::zeroed(), 0u16),
            Bytes32::zeroed(),
            Bytes32::zeroed(),
            TxPointer::default(),
            id,
        ));
    }

    (
        bridge,
        implementation,
        implementation_contract_id,
        UTXOInputs {
            contract: contract_inputs,
            coin: coin_inputs,
            message: message_inputs,
        },
    )
}

/// Relays a message-to-contract message
pub(crate) async fn relay_message_to_contract(
    wallet: &WalletUnlocked,
    message: Input,
    contracts: Vec<Input>,
) -> TxId {
    let provider = wallet.provider().expect("Wallet has no provider");

    let gas_price: u64 = 1; // NodeInfo.min_gas_price is no longer available

    let tx_policies = TxPolicies::new(Some(gas_price), None, Some(0), None, Some(30_000));

    let fetched_gas_coins: Vec<Coin> = provider
        .get_coins(wallet.address(), Default::default())
        .await
        .unwrap();

    let tx = builder::build_contract_message_tx(
        message,
        contracts,
        &fetched_gas_coins,
        &[Output::variable(Address::zeroed(), 0, AssetId::default())],
        tx_policies,
        wallet,
    )
    .await;

    provider
        .send_transaction(tx)
        .await
        .expect("Transaction failed")
}

pub(crate) async fn precalculate_deposit_id() -> ContractId {
    let compiled = Contract::load_from(
        DEPOSIT_RECIPIENT_CONTRACT_BINARY,
        LoadConfiguration::default(),
    )
    .unwrap();

    compiled.contract_id()
}

/// Prefixes the given bytes with the test contract ID
pub(crate) fn prefix_contract_id(mut data: Vec<u8>, contract_id: ContractId) -> Vec<u8> {
    // Turn contract id into array with the given data appended to it
    let test_contract_id: [u8; 32] = contract_id.into();
    let mut test_contract_id = test_contract_id.to_vec();
    test_contract_id.append(&mut data);
    test_contract_id
}

pub(crate) async fn create_recipient_contract(
    wallet: WalletUnlocked,
) -> DepositRecipientContract<WalletUnlocked> {
    let id = Contract::load_from(
        DEPOSIT_RECIPIENT_CONTRACT_BINARY,
        LoadConfiguration::default(),
    )
    .unwrap()
    .deploy(&wallet, TxPolicies::default())
    .await
    .unwrap();

    DepositRecipientContract::new(id, wallet)
}

/// Quickly converts the given hex string into a u8 vector
pub(crate) fn decode_hex(s: &str) -> Vec<u8> {
    let data: StdResult<Vec<u8>, ParseIntError> = (2..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16))
        .collect();
    data.unwrap()
}

pub(crate) fn encode_hex(val: U256) -> [u8; 32] {
    let mut arr = [0u8; 32];
    val.to_big_endian(&mut arr);
    arr
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_deposit_message(
    token: &str,
    token_id: &str,
    from: &str,
    to: [u8; 32],
    amount: U256,
    decimals: u64,
    message_recipient: ContractId,
    deposit_to_contract: bool,
    extra_data: Option<Vec<u8>>,
) -> ((u64, Vec<u8>), (u64, AssetId), Option<ContractId>) {
    let mut message_data: Vec<u8> = vec![];

    let deposit_type: u8 = match (deposit_to_contract, &extra_data) {
        (false, Some(_)) => unreachable!(),
        (false, None) => DEPOSIT_TO_ADDRESS_FLAG,
        (true, None) => DEPOSIT_TO_CONTRACT_FLAG,
        (true, Some(_)) => DEPOSIT_WITH_DATA_FLAG,
    };

    message_data.append(&mut encode_hex(U256::from(deposit_type)).to_vec());
    message_data.append(&mut decode_hex(token));
    message_data.append(&mut decode_hex(token_id));
    message_data.append(&mut decode_hex(from));
    message_data.append(&mut to.to_vec());
    message_data.append(&mut encode_hex(amount).to_vec());
    message_data.append(&mut encode_hex(U256::from(decimals)).to_vec());

    let mut deposit_recipient: Option<ContractId> = None;

    if deposit_to_contract {
        deposit_recipient = Option::Some(ContractId::new(to));
    };

    if let Some(mut data) = extra_data {
        message_data.append(&mut data);
    };

    let message_data = prefix_contract_id(message_data, message_recipient);
    let message = (MESSAGE_AMOUNT, message_data);
    let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());

    (message, coin, deposit_recipient)
}

pub(crate) async fn create_metadata_message(
    token_address: &str,
    token_id: &str,
    token_name: &str,
    token_symbol: &str,
    contract_recipient: ContractId,
) -> Vec<u8> {
    let mut message_data: Vec<u8> = vec![];
    message_data.append(&mut encode_hex(U256::from(METADATA_MESSAGE_FLAG)).to_vec());

    let items: Vec<Token> = vec![
        Token::FixedBytes(decode_hex(token_address)),
        Token::FixedBytes(decode_hex(token_id)),
        Token::String(String::from(token_name)),
        Token::String(String::from(token_symbol)),
    ];
    let mut payload = ethers::abi::encode(&items);
    message_data.append(&mut payload);

    prefix_contract_id(message_data, contract_recipient)
}

pub(crate) fn parse_output_message_data(data: &[u8]) -> (Vec<u8>, Bits256, Bits256, U256, Bits256) {
    let selector = &data[0..4];
    let to: [u8; 32] = data[4..36].try_into().unwrap();
    let token_array: [u8; 32] = data[36..68].try_into().unwrap();
    let token = Bits256(token_array);
    let amount_array: [u8; 32] = data[68..100].try_into().unwrap();
    let amount: U256 = U256::from_big_endian(amount_array.as_ref());
    let token_id: [u8; 32] = data[100..132].try_into().unwrap();
    (
        selector.to_vec(),
        Bits256(to),
        token,
        amount,
        Bits256(token_id),
    )
}

pub(crate) async fn contract_balance(
    provider: &Provider,
    contract_id: &Bech32ContractId,
    asset: AssetId,
) -> u64 {
    provider
        .get_contract_asset_balance(contract_id, asset)
        .await
        .unwrap()
}

pub(crate) async fn wallet_balance(wallet: &WalletUnlocked, asset_id: &AssetId) -> u64 {
    wallet.get_asset_balance(asset_id).await.unwrap()
}

pub(crate) fn get_asset_id(contract_id: &Bech32ContractId, token: &str) -> AssetId {
    let data: Vec<u8> = Bits256::from_hex_str(token)
        .unwrap()
        .0
        .iter()
        .chain(Bits256::zeroed().0.iter())
        .cloned()
        .collect();

    let sub_id = sha2::Sha256::digest(data);

    contract_id.asset_id(&Bits256::from_hex_str(&hex::encode(sub_id)).unwrap())
}

/// This setup mints tokens so that they are registered as minted assets in the bridge
pub(crate) async fn setup_test() -> (
    Bech32ContractId,
    BridgeFungibleTokenContract<WalletUnlocked>,
) {
    let mut wallet = create_wallet();
    let configurables = None;

    let (proxy_id, _implementation_contract_id) = get_contract_ids(&wallet, configurables.clone());

    let amount = u64::MAX;
    let (message, coin, deposit_contract) = create_deposit_message(
        BRIDGED_TOKEN,
        BRIDGED_TOKEN_ID,
        FROM,
        *wallet.address().hash(),
        U256::from(amount),
        BRIDGED_TOKEN_DECIMALS,
        proxy_id,
        false,
        None,
    )
    .await;

    let metadata_message =
        create_metadata_message(BRIDGED_TOKEN, BRIDGED_TOKEN_ID, "Token", "TKN", proxy_id).await;

    let (implementation_contractid, proxy_contract, utxo_inputs) = setup_environment(
        &mut wallet,
        vec![coin],
        vec![message, (0, metadata_message)],
        deposit_contract,
        None,
        configurables,
    )
    .await;

    let tx_id = relay_message_to_contract(
        &wallet,
        utxo_inputs.message[0].clone(),
        utxo_inputs.contract.clone(),
    )
    .await;
    let tx_status = wallet.provider().unwrap().tx_status(&tx_id).await.unwrap();
    assert!(matches!(tx_status, TxStatus::Success { .. }));

    let tx_id = relay_message_to_contract(
        &wallet,
        utxo_inputs.message[1].clone(),
        utxo_inputs.contract.clone(),
    )
    .await;

    let tx_status = wallet.provider().unwrap().tx_status(&tx_id).await.unwrap();
    assert!(matches!(tx_status, TxStatus::Success { .. }));

    (implementation_contractid, proxy_contract)
}

pub(crate) fn get_contract_ids(
    proxy_owner: &WalletUnlocked,
    implementation_configurables: Option<BridgeFungibleTokenContractConfigurables>,
) -> (ContractId, ContractId) {
    // Set up the bridge contract instance
    let implementation_config = match implementation_configurables {
        Some(config) => LoadConfiguration::default().with_configurables(config),
        None => LoadConfiguration::default(),
    };

    let implementation_contract_id: ContractId =
        Contract::load_from(BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY, implementation_config)
            .unwrap()
            .contract_id();
    let implementation_contract_bech32: Bech32ContractId =
        implementation_contract_id.clone().into();

    let target_key_hash = Hasher::hash("storage_SRC14_0");
    let slot_override_target = StorageSlot::new(
        target_key_hash,
        (*implementation_contract_bech32.hash).into(),
    );
    let owner_key_hash = Hasher::hash("storage_SRC14_1");
    let slot_override_owner =
        StorageSlot::new(owner_key_hash, (*proxy_owner.address().hash).into());

    let storage_configuration = StorageConfiguration::default()
        .add_slot_overrides([slot_override_target, slot_override_owner]);

    let proxy_config =
        LoadConfiguration::default().with_storage_configuration(storage_configuration);
    let proxy_contract_id = Contract::load_from(BRIDGE_PROXY_BINARY, proxy_config)
        .unwrap()
        .contract_id();

    (proxy_contract_id, implementation_contract_id)
}
