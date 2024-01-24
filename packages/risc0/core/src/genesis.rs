use crate::database::Database;
// use fuel_core::database::Database;
use anyhow::anyhow;
use fuel_core_chain_config::{
    ContractConfig,
    GenesisCommitment,
    StateConfig, ChainConfig,
};
use fuel_core_executor::refs::ContractRef;
use fuel_core_storage::{
    tables::{
        Coins,
        ContractsInfo,
        ContractsLatestUtxo,
        ContractsRawCode,
        FuelBlocks,
        Messages, SealedBlockConsensus,
    },
    Result as StorageResult,
    transactional::Transactional,
    MerkleRoot,
    StorageAsMut,
};
use fuel_core_types::{
    blockchain::{
        block::{Block, PartialFuelBlock},
        consensus::{Genesis, Consensus},
        header::{
            ApplicationHeader,
            ConsensusHeader,
            PartialBlockHeader,
        },
        primitives::{Empty, BlockId}, SealedBlock,
    },
    entities::{
        coins::coin::CompressedCoin,
        contract::ContractUtxoInfo,
        message::Message,
    },
    fuel_merkle::binary,
    fuel_tx::{
        Contract,
        TxPointer,
        UtxoId,
    },
    fuel_types::{
        bytes::WORD_SIZE,
        Bytes32,
        ContractId,
    },
};
use fuel_types::BlockHeight;
use itertools::Itertools;

/// Loads state from the chain config into database
pub fn initialize_state(
    config: &ChainConfig,
    database: &Database,
    initial_block: &Block
) -> anyhow::Result<()> {
    import_genesis_block(config, database, initial_block)?;

    Ok(())
}

fn import_genesis_block(
    chain_conf: &ChainConfig,
    original_database: &Database,
    initial_block: &Block
) -> anyhow::Result<()> {
    // start a db transaction for bulk-writing
    let mut database_transaction = Transactional::transaction(original_database);

    let database = database_transaction.as_mut();
    // Initialize the chain id and height.

    let chain_config_hash = chain_conf.root()?.into();
    let coins_root = init_coin_state(database, &chain_conf.initial_state)?.into();
    let contracts_root =
        init_contracts(database, &chain_conf.initial_state)?.into();
    let messages_root = init_da_messages(database, &chain_conf.initial_state)?;
    let messages_root = messages_root.into();

    let genesis = Genesis {
        chain_config_hash,
        coins_root,
        contracts_root,
        messages_root,
    };

    let header = PartialBlockHeader {
        application: ApplicationHeader::<Empty> {
            // TODO: Set `da_height` based on the chain config.
            da_height: Default::default(),
            generated: Empty,
        },
        consensus: ConsensusHeader::<Empty> {
            prev_root: initial_block.header().prev_root().clone(),
            // The initial height is defined by the `ChainConfig`.
            // If it is `None` then it will be zero.
            height: chain_conf
                .initial_state
                .as_ref()
                .map(|config| config.height.unwrap_or_else(|| 0u32.into()))
                .unwrap_or_else(|| 0u32.into()),
            time: initial_block.header().consensus.time,
            generated: Empty,
        },
    };
    
    let block = PartialFuelBlock {
        header,
        transactions: initial_block.transactions().to_vec()
    }.generate(&vec![]);

    let block_id = block.id();
    database.storage::<FuelBlocks>().insert(
        &block_id,
        &block.compress(&chain_conf.consensus_parameters.chain_id),
    )?;
    let consensus = Consensus::Genesis(genesis);
        let sealed_block = SealedBlock {
        entity: block,
        consensus,
    };

    // Commit to database, from Importer service:
    let block = &sealed_block.entity;
    let consensus = &sealed_block.consensus;
    let block_id = &block.id();
    let actual_next_height = *block.header().height();

    let expected_next_height = match consensus {
        Consensus::Genesis(_) => {
            database.latest_height().expect("NotFound");
            actual_next_height
        }
        Consensus::PoA(_) => {
            if actual_next_height == BlockHeight::from(0u32) {
                panic!("ZeroNonGenericHeight");
            }

            let last_db_height = database.latest_height().expect("BlockHeight");
            let actual_next_height: u32 = *last_db_height + 1u32;
            BlockHeight::from(actual_next_height)
        }
    };

    if expected_next_height != actual_next_height {
        panic!("Expected next height mismatch");
    }

    let db_after_execution = database_transaction.as_mut();

    db_after_execution.seal_block(&block_id, &sealed_block.consensus)?;

    // Update the total tx count in chain metadata
    db_after_execution
        // Safety: casting len to u64 since it's impossible to execute a block with more than 2^64 txs
        .increase_tx_count(sealed_block.entity.transactions().len() as u64)?;

    database_transaction.commit()?;

    // let importer = Importer::new(
    //     config.block_importer.clone(),
    //     original_database.clone(),
    //     (),
    //     (),
    // );
    // importer.commit_result(UncommittedImportResult::new(
    //     ImportResult::new_from_local(block, vec![]),
    //     database_transaction,
    // ))?;
    
    Ok(())
}

fn init_coin_state(
    db: &mut Database,
    state: &Option<StateConfig>,
) -> anyhow::Result<MerkleRoot> {
    let mut coins_tree = binary::in_memory::MerkleTree::new();
    // TODO: Store merkle sum tree root over coins with unspecified utxo ids.
    let mut generated_output_index: u64 = 0;
    if let Some(state) = &state {
        if let Some(coins) = &state.coins {
            for coin in coins {
                let utxo_id = UtxoId::new(
                    // generated transaction id([0..[out_index/255]])
                    coin.tx_id.unwrap_or_else(|| {
                        Bytes32::try_from(
                            (0..(Bytes32::LEN - WORD_SIZE))
                                .map(|_| 0u8)
                                .chain(
                                    (generated_output_index / 255)
                                        .to_be_bytes()
                                        .into_iter(),
                                )
                                .collect_vec()
                                .as_slice(),
                        )
                        .expect("Incorrect genesis transaction id byte length")
                    }),
                    coin.output_index.unwrap_or_else(|| {
                        generated_output_index = generated_output_index
                            .checked_add(1)
                            .expect("The maximum number of UTXOs supported in the genesis configuration has been exceeded.");
                        (generated_output_index % 255) as u8
                    }),
                );

                let coin = CompressedCoin {
                    owner: coin.owner,
                    amount: coin.amount,
                    asset_id: coin.asset_id,
                    maturity: coin.maturity.unwrap_or_default(),
                    tx_pointer: TxPointer::new(
                        coin.tx_pointer_block_height.unwrap_or_default(),
                        coin.tx_pointer_tx_idx.unwrap_or_default(),
                    ),
                };

                // ensure coin can't point to blocks in the future
                if coin.tx_pointer.block_height() > state.height.unwrap_or_default() {
                    return Err(anyhow!(
                        "coin tx_pointer height cannot be greater than genesis block"
                    ))
                }

                if db.storage::<Coins>().insert(&utxo_id, &coin)?.is_some() {
                    return Err(anyhow!("Coin should not exist"))
                }
                coins_tree.push(coin.root()?.as_slice())
            }
        }
    }
    Ok(coins_tree.root())
}

fn init_contracts(
    db: &mut Database,
    state: &Option<StateConfig>,
) -> anyhow::Result<MerkleRoot> {
    let mut contracts_tree = binary::in_memory::MerkleTree::new();
    // initialize contract state
    if let Some(state) = &state {
        if let Some(contracts) = &state.contracts {
            for (generated_output_index, contract_config) in contracts.iter().enumerate()
            {
                let contract = Contract::from(contract_config.code.as_slice());
                let salt = contract_config.salt;
                let root = contract.root();
                let contract_id = contract_config.contract_id;
                let utxo_id = if let (Some(tx_id), Some(output_idx)) =
                    (contract_config.tx_id, contract_config.output_index)
                {
                    UtxoId::new(tx_id, output_idx)
                } else {
                    #[allow(clippy::cast_possible_truncation)]
                    UtxoId::new(
                        // generated transaction id([0..[out_index/255]])
                        Bytes32::try_from(
                            (0..(Bytes32::LEN - WORD_SIZE))
                                .map(|_| 0u8)
                                .chain(
                                    (generated_output_index as u64 / 255)
                                        .to_be_bytes()
                                        .into_iter(),
                                )
                                .collect_vec()
                                .as_slice(),
                        )
                        .expect("Incorrect genesis transaction id byte length"),
                        generated_output_index as u8,
                    )
                };
                let tx_pointer = if let (Some(block_height), Some(tx_idx)) = (
                    contract_config.tx_pointer_block_height,
                    contract_config.tx_pointer_tx_idx,
                ) {
                    TxPointer::new(block_height, tx_idx)
                } else {
                    TxPointer::default()
                };

                if tx_pointer.block_height() > state.height.unwrap_or_default() {
                    return Err(anyhow!(
                        "contract tx_pointer cannot be greater than genesis block"
                    ))
                }

                // insert contract code
                if db
                    .storage::<ContractsRawCode>()
                    .insert(&contract_id, contract.as_ref())?
                    .is_some()
                {
                    return Err(anyhow!("Contract code should not exist"))
                }

                // insert contract root
                if db
                    .storage::<ContractsInfo>()
                    .insert(&contract_id, &(salt, root))?
                    .is_some()
                {
                    return Err(anyhow!("Contract info should not exist"))
                }
                if db
                    .storage::<ContractsLatestUtxo>()
                    .insert(
                        &contract_id,
                        &ContractUtxoInfo {
                            utxo_id,
                            tx_pointer,
                        },
                    )?
                    .is_some()
                {
                    return Err(anyhow!("Contract utxo should not exist"))
                }
                init_contract_state(db, &contract_id, contract_config)?;
                init_contract_balance(db, &contract_id, contract_config)?;
                contracts_tree
                    .push(ContractRef::new(&mut *db, contract_id).root()?.as_slice());
            }
        }
    }
    Ok(contracts_tree.root())
}

fn init_contract_state(
    db: &mut Database,
    contract_id: &ContractId,
    contract: &ContractConfig,
) -> anyhow::Result<()> {
    // insert state related to contract
    if let Some(contract_state) = &contract.state {
        db.init_contract_state(contract_id, contract_state.iter().map(Clone::clone))?;

        // let mut database = Database::in_memory();
        // database.init_contract_state(contract_id, contract_state.iter().map(Clone::clone))?;
    }
    Ok(())
}

fn init_da_messages(
    db: &mut Database,
    state: &Option<StateConfig>,
) -> anyhow::Result<MerkleRoot> {
    let mut message_tree = binary::in_memory::MerkleTree::new();
    if let Some(state) = &state {
        if let Some(message_state) = &state.messages {
            for msg in message_state {
                let message = Message {
                    sender: msg.sender,
                    recipient: msg.recipient,
                    nonce: msg.nonce,
                    amount: msg.amount,
                    data: msg.data.clone(),
                    da_height: msg.da_height,
                };

                if db
                    .storage::<Messages>()
                    .insert(message.id(), &message)?
                    .is_some()
                {
                    return Err(anyhow!("Message should not exist"))
                }
                message_tree.push(message.root()?.as_slice());
            }
        }
    }

    Ok(message_tree.root())
}

fn init_contract_balance(
    db: &mut Database,
    contract_id: &ContractId,
    contract: &ContractConfig,
) -> anyhow::Result<()> {
    // insert balances related to contract
    if let Some(balances) = &contract.balances {
        db.init_contract_balances(contract_id, balances.clone().into_iter())?;
    }
    Ok(())
}


/// The port for returned database from the executor.
pub trait ExecutorDatabase {
    /// Assigns the `Consensus` data to the block under the `block_id`.
    /// Return the previous value at the `height`, if any.
    fn seal_block(
        &mut self,
        block_id: &BlockId,
        consensus: &Consensus,
    ) -> StorageResult<Option<Consensus>>;
}

impl ExecutorDatabase for Database {
    fn seal_block(
        &mut self,
        block_id: &BlockId,
        consensus: &Consensus,
    ) -> StorageResult<Option<Consensus>> {
        self.storage::<SealedBlockConsensus>()
            .insert(block_id, consensus)
            .map_err(Into::into)
    }
}