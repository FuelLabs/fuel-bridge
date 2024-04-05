library;

use std::alloc::alloc_bytes;
use std::bytes::*;
use std::constants::ZERO_B256;
use std::string::String;
use std::inputs::input_message_data;
use std::primitive_conversions::u64::*;
use ::data_structures::constants::{
    OFFSET_TOKEN_ADDRESS, 
    OFFSET_TOKEN_ID,
    OFFSET_NAME_PTR,
    OFFSET_SYMBOL_PTR
};

pub struct MetadataMessage {
    pub token_address: b256,
    pub token_id: b256,
    pub name: String,
    pub symbol: String,
}

/// Message payload as it comes from EVM:
///             00 - 1F
/// 00000000    token_address
/// 00000020    token_id
/// 00000040    name_ptr = will always be 0x80, points to name_len
/// 00000060    symbol_ptr = usually 0xC0, depends on name_len, points to symbol_len
/// 00000080    name_len = how many bytes from the next slot (A0) onwards encode the name
/// 000000A0    [name bytes, zero padded on the right to 32 bytes]
/// 000000C0    symbol_len = how many bytes from the next slot onwards encode the symbol
/// 000000E0    [symbol bytes, zero padded on the right to 32 bytes]
impl MetadataMessage {
    // This function traverses the EVM payload as if it were a stack, from the last bytes
    // to the first bytes
    pub fn parse(msg_idx: u64) -> Self {
        // EVM message payload, stripped of anything that was added by FuelVM
        let data: Bytes = input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS);

        // Get the EVM payload offset at which the symbol is encoded as [len, ...utf_bytes]
        let symbol_offset: u64 = <u64 as TryFrom<u256>>::try_from(b256::from(input_message_data(msg_idx, OFFSET_SYMBOL_PTR)).as_u256()).unwrap();

        // Isolate the symbol string payload from the rest of the data:
        let (data, symbol_payload) = data.split_at(symbol_offset);

        // Extract the symbol
        let symbol: String = get_string_from_evm_bytes(symbol_payload);

        // Repeat the same operation with the name:
        let name_offset: u64 = <u64 as TryFrom<u256>>::try_from(b256::from(input_message_data(msg_idx, OFFSET_NAME_PTR)).as_u256()).unwrap();

        let (data, name_payload) = data.split_at(name_offset);

        let name: String = get_string_from_evm_bytes(name_payload);

        // Finally, just separate the first 32 bytes from the rest
        // to access token_address and token_id
        let (token_address, token_id) = data.split_at(32);

        let mut msg_data = Self {
            token_address: token_address.into(),
            token_id: token_id.into(),
            name,
            symbol,
        };

        msg_data
    }
}

fn get_string_from_evm_bytes(evm_bytes: Bytes) -> String {
    // The length of the symbol is always encoded in the first 32 bytes
    // of the symbol payload
    let len: u64 = <u64 as TryFrom<u256>>::try_from(b256::from(evm_bytes).as_u256()).unwrap();

    // Now get the bytes and put them in a String
    match len {
        0 => String::from_ascii_str(""),
        _ => {
            // The actual UTF bytes are encoded right after the length (32 bytes)
            let (_, str_bytes) = evm_bytes.split_at(32);
            let new_str = alloc_bytes(len);
            str_bytes.buf.ptr().copy_bytes_to(new_str, len);
            String::from_ascii(Bytes::from(raw_slice::from_parts::<u8>(new_str, len)))
        },
    }
}
