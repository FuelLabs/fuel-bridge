library;

use std::string::String;
use std::inputs::input_message_data;
use ::data_structures::constants::OFFSET_TOKEN_ADDRESS;

pub struct MetadataMessage {
    pub token_address: b256,
    pub name: String,
    pub symbol: String,
}

impl MetadataMessage {
    pub fn parse(msg_idx: u64) -> Self {

        let mut msg_data = Self {
            token_address: input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).into(),
            name: String::from_ascii_str("test_TODO"),
            symbol: String::from_ascii_str("test_TODO"),
        };

        msg_data
    }
}
