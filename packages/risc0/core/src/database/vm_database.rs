use crate::database::{Database, Error as DatabaseError};
use anyhow::anyhow;
use fuel_core_storage::{
    not_found, tables::ContractsState, ContractsAssetsStorage, ContractsStateKey,
    Error as StorageError, Mappable, MerkleRoot, MerkleRootStorage, StorageAsMut, StorageInspect,
    StorageMutate, StorageRead, StorageSize,
};
use fuel_core_types::{
    blockchain::header::ConsensusHeader,
    fuel_tx::{Contract, StorageSlot},
    fuel_types::{BlockHeight, Bytes32, ContractId, Salt, Word},
    fuel_vm::InterpreterStorage,
    tai64::Tai64,
};
use primitive_types::U256;
use std::borrow::Cow;

/// Used to store metadata relevant during the execution of a transaction
#[derive(Clone)]
pub struct VmDatabase {
    current_block_height: BlockHeight,
    current_timestamp: Tai64,
    coinbase: ContractId,
    database: Database,
}

pub trait IncreaseStorageKey {
    fn increase(&mut self) -> anyhow::Result<()>;
}

impl IncreaseStorageKey for U256 {
    fn increase(&mut self) -> anyhow::Result<()> {
        *self = self
            .checked_add(1.into())
            .ok_or_else(|| anyhow!("range op exceeded available keyspace"))?;
        Ok(())
    }
}

impl Default for VmDatabase {
    fn default() -> Self {
        Self {
            current_block_height: Default::default(),
            current_timestamp: Tai64::now(),
            coinbase: Default::default(),
            database: Default::default(),
        }
    }
}

impl VmDatabase {
    pub fn new<T>(database: Database, header: &ConsensusHeader<T>, coinbase: ContractId) -> Self {
        Self {
            current_block_height: header.height,
            current_timestamp: header.time,
            coinbase,
            database,
        }
    }

    pub fn default_from_database(database: Database) -> Self {
        Self {
            database,
            ..Default::default()
        }
    }

    pub fn database_mut(&mut self) -> &mut Database {
        &mut self.database
    }
}

impl<M: Mappable> StorageInspect<M> for VmDatabase
where
    Database: StorageInspect<M, Error = StorageError>,
{
    type Error = StorageError;

    fn get(&self, key: &M::Key) -> Result<Option<Cow<M::OwnedValue>>, Self::Error> {
        StorageInspect::<M>::get(&self.database, key)
    }

    fn contains_key(&self, key: &M::Key) -> Result<bool, Self::Error> {
        StorageInspect::<M>::contains_key(&self.database, key)
    }
}

impl<M: Mappable> StorageMutate<M> for VmDatabase
where
    Database: StorageMutate<M, Error = StorageError>,
{
    fn insert(
        &mut self,
        key: &M::Key,
        value: &M::Value,
    ) -> Result<Option<M::OwnedValue>, Self::Error> {
        StorageMutate::<M>::insert(&mut self.database, key, value)
    }

    fn remove(&mut self, key: &M::Key) -> Result<Option<M::OwnedValue>, Self::Error> {
        StorageMutate::<M>::remove(&mut self.database, key)
    }
}

impl<M: Mappable> StorageSize<M> for VmDatabase
where
    Database: StorageSize<M, Error = StorageError>,
{
    fn size_of_value(&self, key: &M::Key) -> Result<Option<usize>, Self::Error> {
        StorageSize::<M>::size_of_value(&self.database, key)
    }
}

impl<M: Mappable> StorageRead<M> for VmDatabase
where
    Database: StorageRead<M, Error = StorageError>,
{
    fn read(&self, key: &M::Key, buf: &mut [u8]) -> Result<Option<usize>, Self::Error> {
        StorageRead::<M>::read(&self.database, key, buf)
    }

    fn read_alloc(&self, key: &<M as Mappable>::Key) -> Result<Option<Vec<u8>>, Self::Error> {
        StorageRead::<M>::read_alloc(&self.database, key)
    }
}

impl<K, M: Mappable> MerkleRootStorage<K, M> for VmDatabase
where
    Database: MerkleRootStorage<K, M, Error = StorageError>,
{
    fn root(&self, key: &K) -> Result<MerkleRoot, Self::Error> {
        MerkleRootStorage::<K, M>::root(&self.database, key)
    }
}

impl ContractsAssetsStorage for VmDatabase {}

impl InterpreterStorage for VmDatabase {
    type DataError = StorageError;

    fn block_height(&self) -> Result<BlockHeight, Self::DataError> {
        Ok(self.current_block_height)
    }

    fn timestamp(&self, height: BlockHeight) -> Result<Word, Self::DataError> {
        let timestamp = match height {
            // panic if $rB is greater than the current block height.
            height if height > self.current_block_height => {
                return Err(anyhow!("block height too high for timestamp").into())
            }
            height if height == self.current_block_height => self.current_timestamp,
            height => self.database.block_time(&height)?,
        };
        Ok(timestamp.0)
    }

    fn block_hash(&self, block_height: BlockHeight) -> Result<Bytes32, Self::DataError> {
        // Block header hashes for blocks with height greater than or equal to current block height are zero (0x00**32).
        // https://github.com/FuelLabs/fuel-specs/blob/master/specs/vm/instruction_set.md#bhsh-block-hash
        if block_height >= self.current_block_height || block_height == Default::default() {
            Ok(Bytes32::zeroed())
        } else {
            // this will return 0x00**32 for block height 0 as well
            self.database
                .get_block_id(&block_height)?
                .ok_or(not_found!("BlockId"))
                .map(Into::into)
        }
    }

    fn coinbase(&self) -> Result<ContractId, Self::DataError> {
        Ok(self.coinbase)
    }

    fn deploy_contract_with_id(
        &mut self,
        salt: &Salt,
        slots: &[StorageSlot],
        contract: &Contract,
        root: &Bytes32,
        id: &ContractId,
    ) -> Result<(), Self::DataError> {
        self.storage_contract_insert(id, contract)?;
        self.storage_contract_root_insert(id, salt, root)?;

        self.database
            .init_contract_state(id, slots.iter().map(|slot| (*slot.key(), *slot.value())))
    }

    fn merkle_contract_state_range(
        &self,
        contract_id: &ContractId,
        start_key: &Bytes32,
        range: usize,
    ) -> Result<Vec<Option<Cow<Bytes32>>>, Self::DataError> {
        use fuel_core_storage::StorageAsRef;

        let mut key = U256::from_big_endian(start_key.as_ref());
        let mut state_key = Bytes32::zeroed();

        let mut results = Vec::new();
        for _ in 0..range {
            key.to_big_endian(state_key.as_mut());
            let multikey = ContractsStateKey::new(contract_id, &state_key);
            results.push(self.database.storage::<ContractsState>().get(&multikey)?);
            key.increase()?;
        }
        Ok(results)
    }

    fn merkle_contract_state_insert_range(
        &mut self,
        contract_id: &ContractId,
        start_key: &Bytes32,
        values: &[Bytes32],
    ) -> Result<usize, Self::DataError> {
        let mut current_key = U256::from_big_endian(start_key.as_ref());
        // verify key is in range
        current_key
            .checked_add(U256::from(values.len()))
            .ok_or_else(|| DatabaseError::Other(anyhow!("range op exceeded available keyspace")))?;

        let mut key_bytes = Bytes32::zeroed();
        let mut found_unset = 0u32;
        for value in values {
            current_key.to_big_endian(key_bytes.as_mut());

            let option = self
                .database
                .storage::<ContractsState>()
                .insert(&(contract_id, &key_bytes).into(), value)?;

            if option.is_none() {
                found_unset = found_unset
                    .checked_add(1)
                    .expect("We've checked it above via `values.len()`");
            }

            current_key.increase()?;
        }

        Ok(found_unset as usize)
    }

    fn merkle_contract_state_remove_range(
        &mut self,
        contract_id: &ContractId,
        start_key: &Bytes32,
        range: usize,
    ) -> Result<Option<()>, Self::DataError> {
        let mut found_unset = false;

        let mut current_key = U256::from_big_endian(start_key.as_ref());

        let mut key_bytes = Bytes32::zeroed();
        for _ in 0..range {
            current_key.to_big_endian(key_bytes.as_mut());

            let option = self
                .database
                .storage::<ContractsState>()
                .remove(&(contract_id, &key_bytes).into())?;

            found_unset |= option.is_none();

            current_key.increase()?;
        }

        if found_unset {
            Ok(None)
        } else {
            Ok(Some(()))
        }
    }
}
