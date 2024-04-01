library;

use std::string::String;

pub struct MetadataMessage {
    pub name: String,
    pub symbol: String,
}

impl MetadataMessage {
    pub fn parse(_msg_idx: u64) -> Self {
        let mut msg_data = Self {
            name: String::from_ascii_str("test_TODO"),
            symbol: String::from_ascii_str("test_TODO"),
        };

        msg_data
    }
}
