use fuel_core_executor::ports::{MessageIsSpent, TxIdOwnerRecorder};
use fuel_core_types::services::txpool::TransactionStatus;

use crate::database::Database;

use fuel_core_storage::{vm_storage::VmStorageRequirements, Error as StorageError};

impl MessageIsSpent for Database {
    type Error = StorageError;

    fn message_is_spent(
        &self,
        nonce: &fuel_types::Nonce,
    ) -> Result<bool, fuel_core_storage::Error> {
        self.message_is_spent(nonce)
    }
}

impl VmStorageRequirements for Database {
    type Error = StorageError;

    fn block_time(
        &self,
        height: &fuel_types::BlockHeight,
    ) -> Result<fuel_core_types::tai64::Tai64, Self::Error> {
        self.block_time(height)
    }

    fn get_block_id(
        &self,
        height: &fuel_types::BlockHeight,
    ) -> Result<Option<fuel_core_types::blockchain::primitives::BlockId>, Self::Error> {
        self.get_block_id(height)
    }

    fn init_contract_state<S: Iterator<Item = (fuel_types::Bytes32, fuel_types::Bytes32)>>(
        &mut self,
        contract_id: &fuel_types::ContractId,
        slots: S,
    ) -> Result<(), Self::Error> {
        self.init_contract_state(contract_id, slots)
    }
}

impl TxIdOwnerRecorder for Database {
    type Error = StorageError;

    fn record_tx_id_owner(
        &self,
        owner: &fuel_types::Address,
        block_height: fuel_types::BlockHeight,
        tx_idx: u16,
        tx_id: &fuel_types::Bytes32,
    ) -> Result<Option<fuel_types::Bytes32>, Self::Error> {
        self.record_tx_id_owner(owner, block_height, tx_idx, tx_id)
            .map_err(|db_error| StorageError::Other(db_error.into()))
    }

    fn update_tx_status(
        &self,
        id: &fuel_types::Bytes32,
        status: TransactionStatus,
    ) -> Result<Option<TransactionStatus>, Self::Error> {
        self.update_tx_status(id, status)
            .map_err(|db_error| StorageError::Other(db_error.into()))
    }
}
