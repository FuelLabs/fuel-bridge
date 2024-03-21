library;

use std::string::String;

pub struct MetadataMessage {
    pub name: String,
    pub symbol: String,
}

impl MetadataMessage {
    /// Read the bytes passed as message data into an in-memory representation using the MetadataMessage type.
    ///
    /// any data beyond ADDRESS_DEPOSIT_DATA_LEN bytes means deposit is meant for a contract.
    /// if data is > CONTRACT_DEPOSIT_WITHOUT_DATA_LEN bytes, then we also need to call process_message on the destination contract.
    pub fn parse(msg_idx: u64) -> Self {
        let mut msg_data = Self {
            name: String::from_ascii_str("test_TODO"),
            symbol: String::from_ascii_str("test_TODO"),
        };

        msg_data
    }
}
