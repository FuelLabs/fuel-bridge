/**
 * TODO: This module contains functions that should eventually
 * be made part of the fuel-core repo in test-helpers lib.rs
 */
use std::net::SocketAddr;

use fuel_core::{
    chain_config::{ChainConfig, CoinConfig, MessageConfig, StateConfig},
    service::{Config, DbType, FuelService},
};
use fuel_core_interfaces::model::{Coin, DaBlockHeight, Message};
use fuel_crypto::fuel_types::{Address, Word};
use fuels::{
    client::FuelClient,
    tx::{ConsensusParameters, UtxoId},
};

/// Create a vector of messages with the provided sender, recipient, amount and data
pub fn setup_single_message(
    sender: Address,
    recipient: Address,
    amount: Word,
    nonce: Word,
    data: Vec<u8>,
) -> Message {
    Message {
        sender: sender,
        recipient,
        owner: recipient,
        nonce,
        amount,
        data: data,
        da_height: DaBlockHeight::default(),
        fuel_block_spend: None,
    }
}

/// Modified version of setup_test_client from test-helpers lib.rs
pub async fn setup_test_client_with_messages(
    coins: &Vec<(UtxoId, Coin)>,
    messages: &Vec<Message>,
    node_config: Option<Config>,
    consensus_parameters_config: Option<ConsensusParameters>,
) -> (FuelClient, SocketAddr) {
    // Generate coin configs
    let coin_configs: Vec<CoinConfig> = coins
        .into_iter()
        .map(|(utxo_id, coin)| CoinConfig {
            tx_id: Some(*utxo_id.tx_id()),
            output_index: Some(utxo_id.output_index() as u64),
            block_created: Some(coin.block_created),
            maturity: Some(coin.maturity),
            owner: coin.owner,
            amount: coin.amount,
            asset_id: coin.asset_id,
        })
        .collect();

    // Generate message configs
    let message_configs: Vec<MessageConfig> = messages
        .into_iter()
        .map(|message| MessageConfig {
            sender: message.sender,
            recipient: message.recipient,
            owner: message.owner,
            nonce: message.nonce,
            amount: message.amount,
            data: message.data.clone(),
            da_height: message.da_height,
        })
        .collect();

    // Setup node config with genesis coins, messages and utxo_validation enabled
    let config = Config {
        chain_conf: ChainConfig {
            initial_state: Some(StateConfig {
                coins: Some(coin_configs),
                messages: Some(message_configs),
                ..StateConfig::default()
            }),
            transaction_parameters: consensus_parameters_config.unwrap_or_default(),
            ..ChainConfig::local_testnet()
        },
        database_type: DbType::InMemory,
        ..node_config.unwrap_or_else(Config::local_node)
    };

    let srv = FuelService::new_node(config).await.unwrap();
    let client = FuelClient::from(srv.bound_address);

    (client, srv.bound_address)
}
