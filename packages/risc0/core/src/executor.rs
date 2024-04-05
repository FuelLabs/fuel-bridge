use crate::database::Database;
use fuel_core_storage::Error as StorageError;

/// Implemented to satisfy: `GenesisCommitment for ContractRef<&'a mut Database>`
impl fuel_core_executor::refs::ContractStorageTrait for Database {
    type InnerError = StorageError;
}
