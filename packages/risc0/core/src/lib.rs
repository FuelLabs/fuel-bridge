pub mod database;
pub mod state;
pub mod genesis;
pub mod executor;

use std::sync::Arc;

use fuel_core_chain_config::ChainConfig;

// use fuel_core::{database::Database, service::{Config as FuelServiceConfig, config::Trigger, genesis::maybe_initialize_state}};
pub use database::Database;

use fuel_core_types::{
    blockchain::{primitives::DaBlockHeight, header::PartialBlockHeader}, 
    entities::message::Message,
    blockchain::block::Block, services::{executor::ExecutionTypes, p2p::Transactions, block_producer::Components}
};

use fuel_types::{Nonce, Bytes32};
use genesis::initialize_state;
use serde::{Deserialize, Serialize};

use fuel_core_executor::{executor::{Executor, ExecutionOptions, OnceTransactionsSource}, ports::RelayerPort};

#[derive(Clone)]
pub struct MockRelayer {
  database: Database,
}

impl RelayerPort for MockRelayer {
    fn get_message(&self, id: &Nonce, _da_height: &DaBlockHeight) -> anyhow::Result<Option<Message>> {
        use fuel_core_storage::{ tables::Messages, StorageAsRef };
        use std::borrow::Cow;
        Ok(self.database.storage::<Messages>().get(id)?.map(Cow::into_owned))
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
    initial_block_json: &str
) -> Block {   
    let config: ChainConfig = 
        serde_json::from_str(initial_chain_config_json)
        .expect("Could not parse ChainConfig JSON");

    let initial_state = config.clone().initial_state.expect("Could not load initial state");
    let initial_height = initial_state.height.expect("Could not load initial height");
    let initial_block: Block = serde_json::from_str(initial_block_json).expect("Could not load initial block");

    let database = Database::in_memory();
    database.init(&config).expect("database.init() failed");
    initialize_state(&config, &database, &initial_block).expect("Failed to initialize state");

    let relayer: MockRelayer = MockRelayer { database: database.clone() };

    let executor: Executor<MockRelayer, Database> = Executor {
        relayer,
        database: database.clone(),
        config: Arc::new(Default::default()),
    };

    let block: Block<Bytes32> = 
        serde_json::from_str(target_block_json)
        .expect("Could not parse target Block");

    let time = block.header().time();

    let height: fuel_crypto::fuel_types::BlockHeight = (u32::from(initial_height) + 1u32).into();
    let prev_root = block.header().prev_root().clone();

    let transactions: Transactions = 
        serde_json::from_str(transactions_json)
        .expect("Could not deserialize transactions");

    let mut def = PartialBlockHeader::default();
    def.consensus.prev_root = prev_root;
    def.consensus.time = time;
    def.consensus.height = height;


    // ////////////////////////////////////
    // EXECUTION MODE: VALIDATION
    // ///////////////////////////////////

    let block: ExecutionTypes<Components<OnceTransactionsSource>, Block> 
        = ExecutionTypes::Validation(
            Block::try_from_executed(
                block.header().clone(), 
                transactions.clone().0
            ).unwrap()
        );
    
    let execution_result = executor.execute_without_commit(
        block, 
        ExecutionOptions{ utxo_validation: true}
    ).expect("Could not get execution result").into_result();

    let result_block: Block = execution_result.block.clone();

    result_block
}