library;

use std::{constants::ZERO_B256, inputs::{input_message_data, input_message_data_length}};

const OFFSET_TOKEN_ADDRESS = 32;
const OFFSET_TOKEN_ID = 64;
const OFFSET_FROM = 96;
const OFFSET_TO = 128;
const OFFSET_AMOUNT = 160;
pub const ADDRESS_DEPOSIT_DATA_LEN = 192u16;
pub const CONTRACT_DEPOSIT_WITHOUT_DATA_LEN = 193u16;

pub struct MessageData {
    amount: b256,
    from: b256,
    len: u16,
    to: Identity,
    token_address: b256,
    token_id: b256,
}

impl MessageData {
    /// Read the bytes passed as message data into an in-memory representation using the MessageData type.
    ///
    /// any data beyond 160 bytes means deposit is meant for a contract.
    /// if data is > 161 bytes, then we also need to call process_message on the destination contract.
    pub fn parse(msg_idx: u64) -> Self {
        let token_address: b256 = input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).into();
        let len = input_message_data_length(msg_idx);

        let mut msg_data = Self {
            amount: ZERO_B256,
            from: ZERO_B256,
            len,
            token_address,
            to: Identity::Address(Address::from(ZERO_B256)),
            token_id: ZERO_B256,
        };

        // TODO: Bug, have to mutate this struct for these values or tests fail
        msg_data.amount = input_message_data(msg_idx, OFFSET_AMOUNT)
            .into();
        msg_data.from = input_message_data(msg_idx, OFFSET_FROM)
            .into();
        msg_data.token_id = input_message_data(msg_idx, OFFSET_TOKEN_ID)
            .into();
        let to: b256 = input_message_data(msg_idx, OFFSET_TO).into();

        if msg_data.len > ADDRESS_DEPOSIT_DATA_LEN {
            msg_data.to = Identity::ContractId(ContractId::from(to));
        } else {
            msg_data.to = Identity::Address(Address::from(to));
        }

        msg_data
    }
}
