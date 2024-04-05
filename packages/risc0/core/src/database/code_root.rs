use crate::database::{storage::DatabaseColumn, Column};
use fuel_core_storage::tables::ContractsInfo;

impl DatabaseColumn for ContractsInfo {
    fn column() -> Column {
        Column::ContractsInfo
    }
}
