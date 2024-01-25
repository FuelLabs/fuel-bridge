use fuel_core::{service::FuelService, chain_config::{StateConfig, ChainConfig, CoinConfig}, types::{blockchain::block::Block, services::p2p::Transactions}};
use fuel_crypto::fuel_types::Bytes32;

pub fn snapshot(fuel_service: &FuelService) -> anyhow::Result<ChainConfig> {
    let config = &fuel_service.shared.config.chain_conf;

    let state_conf = StateConfig::generate_state_config(fuel_service.shared.database.clone())?;

    // tx_pointer acts as a replay protection measure
    // so if we want to snapshot a node and make it resemble as close as possible the original
    // state that we are snapshotting (so that we later validate a block transition)
    // then we must disable the by-default behaviour of generate_state_config, which
    // saves this info so that forks started from a snapshot do not get replay-attacked.
    let coins: Vec<CoinConfig> = state_conf.clone().coins.unwrap().iter().map(|coin| {
        CoinConfig {
            tx_pointer_block_height: None,
            ..coin.clone()
        }
    }).collect();
    
    let chain_conf = ChainConfig {
        initial_state: Some(StateConfig { coins: Some(coins), ..state_conf}),
        ..config.clone()
    };

    Ok(chain_conf)
}

pub trait SnapshotStringify {
    fn stringify(self) -> anyhow::Result<String>;
}

impl SnapshotStringify for ChainConfig {
    fn stringify(self) -> anyhow::Result<String> {
        let stringified = serde_json::to_string_pretty(&self)?;

        Ok(stringified)    
    }
}

pub fn block_stringify(block: &Block<Bytes32>) -> anyhow::Result<String> {
    let stringified = serde_json::to_string_pretty(block)?;

    Ok(stringified)    
}

pub fn block_stringify_with_txs(block: &Block) -> anyhow::Result<String> {
    let stringified = serde_json::to_string_pretty(block)?;

    Ok(stringified)
}

pub fn txs_stringify(txs: Transactions) -> anyhow::Result<String> {
    let stringified = serde_json::to_string_pretty(&txs)?;

    Ok(stringified)
}