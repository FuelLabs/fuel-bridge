pub mod database;
pub mod executor;
pub mod genesis;
pub mod state;

use std::sync::Arc;

use fuel_core_chain_config::ChainConfig;

// use fuel_core::{database::Database, service::{Config as FuelServiceConfig, config::Trigger, genesis::maybe_initialize_state}};
pub use database::Database;

use fuel_core_types::{
    blockchain::block::Block,
    blockchain::{header::PartialBlockHeader, primitives::DaBlockHeight},
    entities::message::Message,
    services::{block_producer::Components, executor::ExecutionTypes, p2p::Transactions},
};

use fuel_types::{Bytes32, Nonce};
use genesis::initialize_state;
use serde::{Deserialize, Serialize};

use fuel_core_executor::{
    executor::{ExecutionOptions, Executor, OnceTransactionsSource},
    ports::RelayerPort,
};

#[derive(Clone)]
pub struct MockRelayer {
    database: Database,
}

impl RelayerPort for MockRelayer {
    fn get_message(
        &self,
        id: &Nonce,
        _da_height: &DaBlockHeight,
    ) -> anyhow::Result<Option<Message>> {
        use fuel_core_storage::{tables::Messages, StorageAsRef};
        use std::borrow::Cow;
        Ok(self
            .database
            .storage::<Messages>()
            .get(id)?
            .map(Cow::into_owned))
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Inputs {
    pub chain_config: String,
    pub target_block: String,
    pub transactions_json: String,
    pub initial_block_json: String,
}

pub fn check_transition(
    initial_chain_config_json: &str,
    target_block_json: &str,
    transactions_json: &str,
    initial_block_json: &str,
) -> anyhow::Result<Block> {
    let config: ChainConfig = serde_json::from_str(initial_chain_config_json)?;

    let initial_state = config
        .clone()
        .initial_state
        .expect("Could not load initial state");
    let initial_height = initial_state.height.expect("Could not load initial height");
    let initial_block: Block =
        serde_json::from_str(initial_block_json).expect("Could not load initial block");

    let database = Database::in_memory();
    database.init(&config)?;
    initialize_state(&config, &database, &initial_block)?;

    let relayer: MockRelayer = MockRelayer {
        database: database.clone(),
    };

    let executor: Executor<MockRelayer, Database> = Executor {
        relayer,
        database: database.clone(),
        config: Arc::new(Default::default()),
    };

    let block: Block<Bytes32> = serde_json::from_str(target_block_json)?;

    let time = block.header().time();

    let height: fuel_crypto::fuel_types::BlockHeight = (u32::from(initial_height) + 1u32).into();
    let prev_root = *block.header().prev_root();

    let transactions: Transactions = serde_json::from_str(transactions_json)?;

    let mut def = PartialBlockHeader::default();
    def.consensus.prev_root = prev_root;
    def.consensus.time = time;
    def.consensus.height = height;

    // ////////////////////////////////////
    // EXECUTION MODE: VALIDATION
    // ///////////////////////////////////
    let block = match Block::try_from_executed(block.header().clone(), transactions.clone().0) {
        Some(block) => block,
        None => return Err(anyhow::anyhow!("Invalid block or transactions")),
    };

    let execution_block: ExecutionTypes<Components<OnceTransactionsSource>, Block> =
        ExecutionTypes::Validation(block);

    let execution_result = executor
        .execute_without_commit(
            execution_block,
            ExecutionOptions {
                utxo_validation: true,
            },
        )?
        .into_result();

    let result_block: Block = execution_result.block.clone();

    Ok(result_block)
}
