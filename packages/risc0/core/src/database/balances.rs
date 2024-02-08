use crate::database::{
    storage::{
        ContractsAssetsMerkleData, ContractsAssetsMerkleMetadata, DatabaseColumn,
        SparseMerkleMetadata,
    },
    Column, Database,
};
use fuel_core_storage::{
    tables::ContractsAssets, ContractsAssetKey, Error as StorageError, Mappable, MerkleRoot,
    MerkleRootStorage, StorageAsMut, StorageAsRef, StorageInspect, StorageMutate,
};
use fuel_core_types::{
    fuel_asm::Word,
    fuel_merkle::{
        sparse,
        sparse::{in_memory, MerkleTree, MerkleTreeKey},
    },
    fuel_types::{AssetId, ContractId},
};
use itertools::Itertools;
use std::borrow::{BorrowMut, Cow};

impl StorageInspect<ContractsAssets> for Database {
    type Error = StorageError;

    fn get(
        &self,
        key: &<ContractsAssets as Mappable>::Key,
    ) -> Result<Option<Cow<<ContractsAssets as Mappable>::OwnedValue>>, Self::Error> {
        self.get(key.as_ref(), Column::ContractsAssets)
            .map_err(Into::into)
    }

    fn contains_key(&self, key: &<ContractsAssets as Mappable>::Key) -> Result<bool, Self::Error> {
        self.contains_key(key.as_ref(), Column::ContractsAssets)
            .map_err(Into::into)
    }
}

impl StorageMutate<ContractsAssets> for Database {
    fn insert(
        &mut self,
        key: &<ContractsAssets as Mappable>::Key,
        value: &<ContractsAssets as Mappable>::Value,
    ) -> Result<Option<<ContractsAssets as Mappable>::OwnedValue>, Self::Error> {
        let prev = Database::insert(self, key.as_ref(), Column::ContractsAssets, value)
            .map_err(Into::into);

        // Get latest metadata entry for this contract id
        let prev_metadata = self
            .storage::<ContractsAssetsMerkleMetadata>()
            .get(key.contract_id())?
            .unwrap_or_default();

        let root = prev_metadata.root;
        let storage = self.borrow_mut();
        let mut tree: MerkleTree<ContractsAssetsMerkleData, _> =
            MerkleTree::load(storage, &root)
                .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

        // Update the contact's key-value dataset. The key is the asset id and the
        // value the Word
        tree.update(MerkleTreeKey::new(key), value.to_be_bytes().as_slice())
            .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

        // Generate new metadata for the updated tree
        let root = tree.root();
        let metadata = SparseMerkleMetadata { root };
        self.storage::<ContractsAssetsMerkleMetadata>()
            .insert(key.contract_id(), &metadata)?;

        prev
    }

    fn remove(
        &mut self,
        key: &<ContractsAssets as Mappable>::Key,
    ) -> Result<Option<<ContractsAssets as Mappable>::OwnedValue>, Self::Error> {
        let prev =
            Database::remove(self, key.as_ref(), Column::ContractsAssets).map_err(Into::into);

        // Get latest metadata entry for this contract id
        let prev_metadata = self
            .storage::<ContractsAssetsMerkleMetadata>()
            .get(key.contract_id())?;

        if let Some(prev_metadata) = prev_metadata {
            let root = prev_metadata.root;

            // Load the tree saved in metadata
            let storage = self.borrow_mut();
            let mut tree: MerkleTree<ContractsAssetsMerkleData, _> =
                MerkleTree::load(storage, &root)
                    .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

            // Update the contract's key-value dataset. The key is the asset id and
            // the value is the Word
            tree.delete(MerkleTreeKey::new(key))
                .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

            let root = tree.root();
            if root == *sparse::empty_sum() {
                // The tree is now empty; remove the metadata
                self.storage::<ContractsAssetsMerkleMetadata>()
                    .remove(key.contract_id())?;
            } else {
                // Generate new metadata for the updated tree
                let metadata = SparseMerkleMetadata { root };
                self.storage::<ContractsAssetsMerkleMetadata>()
                    .insert(key.contract_id(), &metadata)?;
            }
        }

        prev
    }
}

impl MerkleRootStorage<ContractId, ContractsAssets> for Database {
    fn root(&self, parent: &ContractId) -> Result<MerkleRoot, Self::Error> {
        let metadata = self
            .storage::<ContractsAssetsMerkleMetadata>()
            .get(parent)?;
        let root = metadata
            .map(|metadata| metadata.root)
            .unwrap_or_else(|| in_memory::MerkleTree::new().root());
        Ok(root)
    }
}

impl Database {
    /// Initialize the balances of the contract from the all leafs.
    /// This method is more performant than inserting balances one by one.
    pub fn init_contract_balances<S>(
        &mut self,
        contract_id: &ContractId,
        balances: S,
    ) -> Result<(), StorageError>
    where
        S: Iterator<Item = (AssetId, Word)>,
    {
        if self
            .storage::<ContractsAssetsMerkleMetadata>()
            .contains_key(contract_id)?
        {
            return Err(anyhow::anyhow!("The contract balances is already initialized").into());
        }

        let balances = balances.collect_vec();

        // Keys and values should be original without any modifications.
        // Key is `ContractId` ++ `AssetId`
        self.batch_insert(
            Column::ContractsAssets,
            balances
                .clone()
                .into_iter()
                .map(|(asset, value)| (ContractsAssetKey::new(contract_id, &asset), value)),
        )?;

        // Merkle data:
        // - Asset key should be converted into `MerkleTreeKey` by `new` function that hashes them.
        // - The balance value are original.
        let balances = balances.into_iter().map(|(asset, value)| {
            (
                MerkleTreeKey::new(ContractsAssetKey::new(contract_id, &asset)),
                value.to_be_bytes(),
            )
        });
        let (root, nodes) = in_memory::MerkleTree::nodes_from_set(balances);
        self.batch_insert(ContractsAssetsMerkleData::column(), nodes.into_iter())?;
        let metadata = SparseMerkleMetadata { root };
        self.storage::<ContractsAssetsMerkleMetadata>()
            .insert(contract_id, &metadata)?;

        Ok(())
    }
}
