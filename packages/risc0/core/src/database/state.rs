use crate::database::{
    storage::{
        ContractsStateMerkleData,
        ContractsStateMerkleMetadata,
        DatabaseColumn,
        SparseMerkleMetadata,
    },
    Column,
    Database,
};
use fuel_core_storage::{
    tables::ContractsState,
    ContractsStateKey,
    Error as StorageError,
    Mappable,
    MerkleRoot,
    MerkleRootStorage,
    StorageAsMut,
    StorageAsRef,
    StorageInspect,
    StorageMutate,
};
use fuel_core_types::{
    fuel_merkle::{
        sparse,
        sparse::{
            in_memory,
            MerkleTree,
            MerkleTreeKey,
        },
    },
    fuel_types::{
        Bytes32,
        ContractId,
    },
};
use itertools::Itertools;
use std::borrow::{
    BorrowMut,
    Cow,
};

impl StorageInspect<ContractsState> for Database {
    type Error = StorageError;

    fn get(
        &self,
        key: &<ContractsState as Mappable>::Key,
    ) -> Result<Option<Cow<<ContractsState as Mappable>::OwnedValue>>, Self::Error> {
        self.get(key.as_ref(), Column::ContractsState)
            .map_err(Into::into)
    }

    fn contains_key(
        &self,
        key: &<ContractsState as Mappable>::Key,
    ) -> Result<bool, Self::Error> {
        self.contains_key(key.as_ref(), Column::ContractsState)
            .map_err(Into::into)
    }
}

impl StorageMutate<ContractsState> for Database {
    fn insert(
        &mut self,
        key: &<ContractsState as Mappable>::Key,
        value: &<ContractsState as Mappable>::Value,
    ) -> Result<Option<<ContractsState as Mappable>::OwnedValue>, Self::Error> {
        let prev = Database::insert(self, key.as_ref(), Column::ContractsState, value)
            .map_err(Into::into);

        // Get latest metadata entry for this contract id
        let prev_metadata = self
            .storage::<ContractsStateMerkleMetadata>()
            .get(key.contract_id())?
            .unwrap_or_default();

        let root = prev_metadata.root;
        let storage = self.borrow_mut();
        let mut tree: MerkleTree<ContractsStateMerkleData, _> =
            MerkleTree::load(storage, &root)
                .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

        // Update the contract's key-value dataset. The key is the state key and
        // the value is the 32 bytes
        tree.update(MerkleTreeKey::new(key), value.as_slice())
            .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

        // Generate new metadata for the updated tree
        let root = tree.root();
        let metadata = SparseMerkleMetadata { root };
        self.storage::<ContractsStateMerkleMetadata>()
            .insert(key.contract_id(), &metadata)?;

        prev
    }

    fn remove(
        &mut self,
        key: &<ContractsState as Mappable>::Key,
    ) -> Result<Option<<ContractsState as Mappable>::OwnedValue>, Self::Error> {
        let prev = Database::remove(self, key.as_ref(), Column::ContractsState)
            .map_err(Into::into);

        // Get latest metadata entry for this contract id
        let prev_metadata = self
            .storage::<ContractsStateMerkleMetadata>()
            .get(key.contract_id())?;

        if let Some(prev_metadata) = prev_metadata {
            let root = prev_metadata.root;

            // Load the tree saved in metadata
            let storage = self.borrow_mut();
            let mut tree: MerkleTree<ContractsStateMerkleData, _> =
                MerkleTree::load(storage, &root)
                    .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

            // Update the contract's key-value dataset. The key is the state key and
            // the value is the 32 bytes
            tree.delete(MerkleTreeKey::new(key))
                .map_err(|err| StorageError::Other(anyhow::anyhow!("{err:?}")))?;

            let root = tree.root();
            if root == *sparse::empty_sum() {
                // The tree is now empty; remove the metadata
                self.storage::<ContractsStateMerkleMetadata>()
                    .remove(key.contract_id())?;
            } else {
                // Generate new metadata for the updated tree
                let metadata = SparseMerkleMetadata { root };
                self.storage::<ContractsStateMerkleMetadata>()
                    .insert(key.contract_id(), &metadata)?;
            }
        }

        prev
    }
}

impl MerkleRootStorage<ContractId, ContractsState> for Database {
    fn root(&self, parent: &ContractId) -> Result<MerkleRoot, Self::Error> {
        let metadata = self.storage::<ContractsStateMerkleMetadata>().get(parent)?;
        let root = metadata
            .map(|metadata| metadata.root)
            .unwrap_or_else(|| in_memory::MerkleTree::new().root());
        Ok(root)
    }
}

impl Database {
    /// Initialize the state of the contract from all leaves.
    /// This method is more performant than inserting state one by one.
    pub fn init_contract_state<S>(
        &mut self,
        contract_id: &ContractId,
        slots: S,
    ) -> Result<(), StorageError>
    where
        S: Iterator<Item = (Bytes32, Bytes32)>,
    {
        let slots = slots.collect_vec();

        if slots.is_empty() {
            return Ok(())
        }

        if self
            .storage::<ContractsStateMerkleMetadata>()
            .contains_key(contract_id)?
        {
            return Err(anyhow::anyhow!("The contract state is already initialized").into())
        }

        // Keys and values should be original without any modifications.
        // Key is `ContractId` ++ `StorageKey`
        self.batch_insert(
            Column::ContractsState,
            slots
                .clone()
                .into_iter()
                .map(|(key, value)| (ContractsStateKey::new(contract_id, &key), value)),
        )?;

        // Merkle data:
        // - State key should be converted into `MerkleTreeKey` by `new` function that hashes them.
        // - The state value are original.
        let slots = slots.into_iter().map(|(key, value)| {
            (
                MerkleTreeKey::new(ContractsStateKey::new(contract_id, &key)),
                value,
            )
        });
        let (root, nodes) = in_memory::MerkleTree::nodes_from_set(slots);
        self.batch_insert(ContractsStateMerkleData::column(), nodes.into_iter())?;
        let metadata = SparseMerkleMetadata { root };
        self.storage::<ContractsStateMerkleMetadata>()
            .insert(contract_id, &metadata)?;

        Ok(())
    }
}
