use crate::database::{
    storage::{
        DenseMerkleMetadata,
        FuelBlockMerkleData,
        FuelBlockMerkleMetadata,
        FuelBlockSecondaryKeyBlockHeights,
        ToDatabaseKey,
    },
    Column,
    Database,
    Error as DatabaseError,
    Result as DatabaseResult,
};
use fuel_core_storage::{
    iter::IterDirection,
    not_found,
    tables::{
        FuelBlocks,
        Transactions,
    },
    Error as StorageError,
    MerkleRootStorage,
    Result as StorageResult,
    StorageAsMut,
    StorageAsRef,
    StorageInspect,
    StorageMutate,
};
use fuel_core_types::{
    blockchain::{
        block::{
            Block,
            CompressedBlock,
        },
        primitives::BlockId,
    },
    entities::message::MerkleProof,
    fuel_merkle::binary::MerkleTree,
    fuel_types::BlockHeight,
    tai64::Tai64,
};
use itertools::Itertools;
use std::{
    borrow::{
        BorrowMut,
        Cow,
    },
    convert::{
        TryFrom,
        TryInto,
    },
};

impl StorageInspect<FuelBlocks> for Database {
    type Error = StorageError;

    fn get(&self, key: &BlockId) -> Result<Option<Cow<CompressedBlock>>, Self::Error> {
        Database::get(self, key.as_slice(), Column::FuelBlocks).map_err(Into::into)
    }

    fn contains_key(&self, key: &BlockId) -> Result<bool, Self::Error> {
        Database::contains_key(self, key.as_slice(), Column::FuelBlocks)
            .map_err(Into::into)
    }
}

impl StorageMutate<FuelBlocks> for Database {
    fn insert(
        &mut self,
        key: &BlockId,
        value: &CompressedBlock,
    ) -> Result<Option<CompressedBlock>, Self::Error> {
        let prev = Database::insert(self, key.as_slice(), Column::FuelBlocks, value)?;

        let height = value.header().height();
        self.storage::<FuelBlockSecondaryKeyBlockHeights>()
            .insert(height, key)?;

        // Get latest metadata entry
        let prev_metadata = self
            .iter_all::<Vec<u8>, DenseMerkleMetadata>(
                Column::FuelBlockMerkleMetadata,
                Some(IterDirection::Reverse),
            )
            .next()
            .transpose()?
            .map(|(_, metadata)| metadata)
            .unwrap_or_default();

        let storage = self.borrow_mut();
        let mut tree: MerkleTree<FuelBlockMerkleData, _> =
            MerkleTree::load(storage, prev_metadata.version)
                .map_err(|err| StorageError::Other(anyhow::anyhow!(err)))?;
        let data = key.as_slice();
        tree.push(data)?;

        // Generate new metadata for the updated tree
        let version = tree.leaves_count();
        let root = tree.root();
        let metadata = DenseMerkleMetadata { version, root };
        self.storage::<FuelBlockMerkleMetadata>()
            .insert(height, &metadata)?;

        Ok(prev)
    }

    fn remove(&mut self, key: &BlockId) -> Result<Option<CompressedBlock>, Self::Error> {
        let prev: Option<CompressedBlock> =
            Database::remove(self, key.as_slice(), Column::FuelBlocks)?;

        if let Some(block) = &prev {
            let height = block.header().height();
            let _ = self
                .storage::<FuelBlockSecondaryKeyBlockHeights>()
                .remove(height);
            // We can't clean up `MerkleTree<FuelBlockMerkleData>`.
            // But if we plan to insert a new block, it will override old values in the
            // `FuelBlockMerkleData` table.
            let _ = self.storage::<FuelBlockMerkleMetadata>().remove(height);
        }

        Ok(prev)
    }
}

impl Database {
    pub fn latest_height(&self) -> StorageResult<BlockHeight> {
        self.ids_of_latest_block()?
            .map(|(height, _)| height)
            .ok_or(not_found!("BlockHeight"))
    }

    /// Get the current block at the head of the chain.
    pub fn get_current_block(&self) -> StorageResult<Option<Cow<CompressedBlock>>> {
        let block_ids = self.ids_of_latest_block()?;
        match block_ids {
            Some((_, id)) => Ok(StorageAsRef::storage::<FuelBlocks>(self).get(&id)?),
            None => Ok(None),
        }
    }

    pub fn block_time(&self, height: &BlockHeight) -> StorageResult<Tai64> {
        let id = self.get_block_id(height)?.unwrap_or_default();
        let block = self
            .storage::<FuelBlocks>()
            .get(&id)?
            .ok_or(not_found!(FuelBlocks))?;
        Ok(block.header().time().to_owned())
    }

    pub fn get_block_id(&self, height: &BlockHeight) -> StorageResult<Option<BlockId>> {
        Database::get(
            self,
            height.database_key().as_ref(),
            Column::FuelBlockSecondaryKeyBlockHeights,
        )
        .map_err(Into::into)
    }

    pub fn all_block_ids(
        &self,
        start: Option<BlockHeight>,
        direction: IterDirection,
    ) -> impl Iterator<Item = DatabaseResult<(BlockHeight, BlockId)>> + '_ {
        let start = start.map(|b| b.to_bytes());
        self.iter_all_by_start::<Vec<u8>, BlockId, _>(
            Column::FuelBlockSecondaryKeyBlockHeights,
            start,
            Some(direction),
        )
        .map(|res| {
            let (height, id) = res?;
            let block_height_bytes: [u8; 4] = height
                .as_slice()
                .try_into()
                .expect("block height always has correct number of bytes");
            Ok((block_height_bytes.into(), id))
        })
    }

    pub fn ids_of_genesis_block(&self) -> DatabaseResult<(BlockHeight, BlockId)> {
        self.iter_all(
            Column::FuelBlockSecondaryKeyBlockHeights,
            Some(IterDirection::Forward),
        )
        .next()
        .ok_or(DatabaseError::ChainUninitialized)?
        .map(|(height, id): (Vec<u8>, BlockId)| {
            let bytes = <[u8; 4]>::try_from(height.as_slice())
                .expect("all block heights are stored with the correct amount of bytes");
            (u32::from_be_bytes(bytes).into(), id)
        })
    }

    pub fn ids_of_latest_block(&self) -> DatabaseResult<Option<(BlockHeight, BlockId)>> {
        let ids = self
            .iter_all::<Vec<u8>, BlockId>(
                Column::FuelBlockSecondaryKeyBlockHeights,
                Some(IterDirection::Reverse),
            )
            .next()
            .transpose()?
            .map(|(height, block)| {
                // safety: we know that all block heights are stored with the correct amount of bytes
                let bytes = <[u8; 4]>::try_from(height.as_slice()).unwrap();
                (u32::from_be_bytes(bytes).into(), block)
            });

        Ok(ids)
    }

    /// Retrieve the full block and all associated transactions
    pub(crate) fn get_full_block(
        &self,
        block_id: &BlockId,
    ) -> StorageResult<Option<Block>> {
        let db_block = self.storage::<FuelBlocks>().get(block_id)?;
        if let Some(block) = db_block {
            // fetch all the transactions
            // TODO: optimize with multi-key get
            let txs = block
                .transactions()
                .iter()
                .map(|tx_id| {
                    self.storage::<Transactions>()
                        .get(tx_id)
                        .and_then(|tx| tx.ok_or(not_found!(Transactions)))
                        .map(Cow::into_owned)
                })
                .try_collect()?;
            Ok(Some(block.into_owned().uncompress(txs)))
        } else {
            Ok(None)
        }
    }
}

impl MerkleRootStorage<BlockHeight, FuelBlocks> for Database {
    fn root(
        &self,
        key: &BlockHeight,
    ) -> Result<fuel_core_storage::MerkleRoot, Self::Error> {
        let metadata = self
            .storage::<FuelBlockMerkleMetadata>()
            .get(key)?
            .ok_or(not_found!(FuelBlocks))?;
        Ok(metadata.root)
    }
}

impl Database {
    pub fn block_history_proof(
        &self,
        message_block_height: &BlockHeight,
        commit_block_height: &BlockHeight,
    ) -> StorageResult<MerkleProof> {
        if message_block_height > commit_block_height {
            Err(anyhow::anyhow!(
                "The `message_block_height` is higher than `commit_block_height`"
            ))?;
        }

        let message_merkle_metadata = self
            .storage::<FuelBlockMerkleMetadata>()
            .get(message_block_height)?
            .ok_or(not_found!(FuelBlockMerkleMetadata))?;

        let commit_merkle_metadata = self
            .storage::<FuelBlockMerkleMetadata>()
            .get(commit_block_height)?
            .ok_or(not_found!(FuelBlockMerkleMetadata))?;

        let storage = self;
        let tree: MerkleTree<FuelBlockMerkleData, _> =
            MerkleTree::load(storage, commit_merkle_metadata.version)
                .map_err(|err| StorageError::Other(anyhow::anyhow!(err)))?;

        let proof_index = message_merkle_metadata
            .version
            .checked_sub(1)
            .ok_or(anyhow::anyhow!("The count of leafs - messages is zero"))?;
        let (_, proof_set) = tree
            .prove(proof_index)
            .map_err(|err| StorageError::Other(anyhow::anyhow!(err)))?;

        Ok(MerkleProof {
            proof_set,
            proof_index,
        })
    }
}
