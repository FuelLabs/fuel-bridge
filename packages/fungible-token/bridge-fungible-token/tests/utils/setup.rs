use crate::utils::{
    builder,
    constants::{
        BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY, CONTRACT_MESSAGE_PREDICATE_BINARY,
        DEPOSIT_RECIPIENT_CONTRACT_BINARY, MESSAGE_AMOUNT, MESSAGE_SENDER_ADDRESS,
    },
};
use fuel_core_types::{
    fuel_tx::{Bytes32, Output, TxId, TxPointer, UtxoId},
    fuel_types::{Nonce, Word},
    fuel_vm::SecretKey,
};

use fuels::{
    accounts::{predicate::Predicate, wallet::WalletUnlocked, ViewOnlyAccount}, prelude::{
        abigen, launch_provider_and_get_wallet, setup_custom_assets_coins, setup_test_provider,
        Address, AssetConfig, AssetId, Bech32ContractId, Contract, ContractId, LoadConfiguration,
        Provider, TxPolicies,
    }, test_helpers::{setup_single_message, DEFAULT_COIN_AMOUNT}, tx::Receipt, types::{input::Input, message::Message, Bits256, U256}
};
use std::{mem::size_of, num::ParseIntError, result::Result as StdResult, str::FromStr};

use super::constants::{
    BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_ID, FROM,
};

abigen!(
    Contract(
        name = "BridgeFungibleTokenContract",
        abi = "packages/fungible-token/bridge-fungible-token/out/release/bridge_fungible_token-abi.json",
    ),
    Contract(
        name = "DepositRecipientContract",
        abi =
            "packages/fungible-token/test-deposit-recipient-contract/out/release/test_deposit_recipient_contract-abi.json",
    ),
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

    pub fn fuel_equivalent_amount(&self, amount: U256) -> u64 {
        if self.adjustment.is_div {
            (amount * self.adjustment.factor).as_u64()
        } else {
            (amount / self.adjustment.factor).as_u64()
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
) -> (BridgeFungibleTokenContract<WalletUnlocked>, UTXOInputs) {
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
    let load_configuration = match configurables {
        Some(config) => LoadConfiguration::default().with_configurables(config),
        None => LoadConfiguration::default(),
    };

    let test_contract_id =
        Contract::load_from(BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY, load_configuration)
            .unwrap()
            .deploy(&wallet.clone(), TxPolicies::default())
            .await
            .unwrap();

    let bridge = BridgeFungibleTokenContract::new(test_contract_id.clone(), wallet.clone());

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
                predicate.code().clone(),
                Default::default(),
            )
        })
        .collect();

    // Build contract inputs
    let mut contract_inputs = vec![Input::contract(
        UtxoId::new(Bytes32::zeroed(), 0u8),
        Bytes32::zeroed(),
        Bytes32::zeroed(),
        TxPointer::default(),
        test_contract_id.into(),
    )];

    if let Some(id) = deposit_contract {
        contract_inputs.push(Input::contract(
            UtxoId::new(Bytes32::zeroed(), 0u8),
            Bytes32::zeroed(),
            Bytes32::zeroed(),
            TxPointer::default(),
            id,
        ));
    }

    (
        bridge,
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

    let gas_price = provider
        .node_info()
        .await
        .expect("Could not get node info")
        .min_gas_price;
    let tx_policies = TxPolicies::new(Some(gas_price), None, Some(0), None, Some(30_000));

    let fetched_gas_coins: Vec<Input> = provider
        .get_coins(wallet.address(), Default::default())
        .await
        .unwrap()
        .iter()
        .map(|coin| Input::resource_signed(fuels::types::coin_type::CoinType::Coin(coin.clone())))
        .collect();

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
pub(crate) async fn prefix_contract_id(
    mut data: Vec<u8>,
    config: Option<BridgeFungibleTokenContractConfigurables>,
) -> Vec<u8> {
    // Compute the test contract ID
    let compiled_contract = match config {
        Some(c) => Contract::load_from(
            BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
            LoadConfiguration::default().with_configurables(c),
        )
        .unwrap(),
        None => Contract::load_from(
            BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
            LoadConfiguration::default(),
        )
        .unwrap(),
    };

    let test_contract_id = compiled_contract.contract_id();

    // Turn contract id into array with the given data appended to it
    let test_contract_id: [u8; 32] = test_contract_id.into();
    let mut test_contract_id = test_contract_id.to_vec();
    test_contract_id.append(&mut data);
    test_contract_id
}

pub(crate) async fn create_token() -> BridgeFungibleTokenContract<WalletUnlocked> {
    let wallet = launch_provider_and_get_wallet().await.unwrap();

    let id = Contract::load_from(
        BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY,
        LoadConfiguration::default(),
    )
    .unwrap()
    .deploy(&wallet, TxPolicies::default())
    .await
    .unwrap();

    BridgeFungibleTokenContract::new(id, wallet)
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
    decimals: u8,
    config: Option<BridgeFungibleTokenContractConfigurables>,
    deposit_to_contract: bool,
    extra_data: Option<Vec<u8>>,
) -> ((u64, Vec<u8>), (u64, AssetId), Option<ContractId>) {
    let mut message_data: Vec<u8> = vec![];

    let deposit_type: u8 = match (deposit_to_contract, &extra_data) {
        (false, Some(_)) => unreachable!(),
        (false, None) => 0,
        (true, None) => 1,
        (true, Some(_)) => 2,
    };

    message_data.append(&mut vec![deposit_type]);
    message_data.append(&mut decode_hex(token));
    message_data.append(&mut decode_hex(token_id));
    message_data.append(&mut decode_hex(from));
    message_data.append(&mut to.to_vec());
    message_data.append(&mut encode_hex(amount).to_vec());
    message_data.append(&mut vec![decimals]);

    let mut deposit_recipient: Option<ContractId> = None;

    if deposit_to_contract {
        deposit_recipient = Option::Some(ContractId::new(to));
    };

    if let Some(mut data) = extra_data {
        message_data.append(&mut data);
    };

    let message_data = prefix_contract_id(message_data, config).await;
    let message = (MESSAGE_AMOUNT, message_data);
    let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
    
    (message, coin, deposit_recipient)
}

pub(crate) async fn create_metadata_message(
    _token: &str,
    config: Option<BridgeFungibleTokenContractConfigurables>,
) -> Vec<u8> {
    let message_data: Vec<u8> = vec![];

    let message_data = prefix_contract_id(message_data, config).await;
    message_data
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

pub(crate) fn get_asset_id(contract_id: &Bech32ContractId) -> AssetId {
    contract_id.asset_id(&Bits256::zeroed())
}

/// This setup mints tokens so that they are registered as minted assets in the bridge
pub(crate) async fn setup_test() -> BridgeFungibleTokenContract<WalletUnlocked> {
    let mut wallet = create_wallet();

    let amount = u64::MAX;

    let (message, coin, deposit_contract) = create_deposit_message(
        BRIDGED_TOKEN,
        BRIDGED_TOKEN_ID,
        FROM,
        *wallet.address().hash(),
        U256::from(amount),
        BRIDGED_TOKEN_DECIMALS.try_into().unwrap(),
        None,
        false,
        None,
    )
    .await;

    let (contract, utxo_inputs) = setup_environment(
        &mut wallet,
        vec![coin],
        vec![message],
        deposit_contract,
        None,
        None,
    )
    .await;

    let tx_id = relay_message_to_contract(
        &wallet,
        utxo_inputs.message[0].clone(),
        utxo_inputs.contract,
    )
    .await;

    let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.unwrap().take_receipts();
    assert!(receipts.len() > 0);

    for receipt in receipts {
        if let Receipt::Revert { .. } = receipt {
            unreachable!("Transaction should not have reverted");
        }
    }

    contract
}
