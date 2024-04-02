library;

use std::bytes::*;
use std::constants::ZERO_B256;
use std::string::String;
use std::inputs::input_message_data;
use std::primitive_conversions::u64::*;
use ::data_structures::constants::{OFFSET_TOKEN_ADDRESS, OFFSET_TOKEN_ID};

const OFFSET_SYMBOL_PTR: u64 = OFFSET_TOKEN_ID + 64;
const OFFSET_NAME_LEN: u64 = OFFSET_TOKEN_ID + 96;

pub struct MetadataMessage {
    pub token_address: b256,
    pub token_id: b256,
    pub name: String,
    pub symbol: String,
}

impl MetadataMessage {
    pub fn parse(msg_idx: u64) -> Self {

        let name_len: u64 = <u64 as TryFrom<u256>>::try_from(
            b256::from(input_message_data(msg_idx, OFFSET_NAME_LEN)).as_u256()
        ).unwrap();
        let name: String = {
            match name_len {
                0 => String::from_ascii_str(""),
                _ => {
                    let mut str_as_bytes: Bytes = Bytes::with_capacity(name_len);
                    let mut counter = 0;
                    let data: Bytes = input_message_data(msg_idx, OFFSET_NAME_LEN + 32);
                    
                    while counter < name_len {
                        str_as_bytes.push(data.get(counter).unwrap());
                        counter += 1;
                    }
                    String::from_ascii(str_as_bytes)
                },
            }
        };

        let _data: Bytes = input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS);

        let symbol_ptr: u64 = <u64 as TryFrom<u256>>::try_from(
            b256::from(input_message_data(msg_idx, OFFSET_SYMBOL_PTR)).as_u256()
        ).unwrap();
        let (_name_payload, symbol_payload) = _data.split_at(symbol_ptr);

        let symbol: String = {
            let symbol_len: u64 = <u64 as TryFrom<u256>>::try_from(
                b256::from(symbol_payload).as_u256()
            ).unwrap();

            match symbol_len {
                0 => String::from_ascii_str("TKN"),
                _ => {
                    log(255);
                    log(symbol_len);

                    let (_, symbol_bytes) = symbol_payload.split_at(32);

                    let mut str_as_bytes: Bytes = Bytes::with_capacity(symbol_len);

                    // str_as_bytes.ptr();
                    // symbol_bytes.ptr().add_uint_offset(32).copy_bytes_to(str_as_bytes.ptr(), symbol_len);
                    String::from_ascii_str("TKN")
                },
            }
        };
        
        let mut msg_data = Self {
            token_address: input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).into(),
            token_id: input_message_data(msg_idx, OFFSET_TOKEN_ID).into(),
            name,
            symbol,
        };

        msg_data
    }
}
