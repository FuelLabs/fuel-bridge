library;

use std::{constants::ZERO_B256, inputs::{input_message_data, input_message_data_length}};

pub struct MessageData {
    amount: b256,
    from: b256,
    len: u16,
    to: Identity,
    token: b256,
}

impl MessageData {
    /// Read the bytes passed as message data into an in-memory representation using the MessageData type.
    ///
    /// any data beyond 160 bytes means deposit is meant for a contract.
    /// if data is > 161 bytes, then we also need to call process_message on the destination contract.
    pub fn parse(msg_idx: u64) -> Self {
        let token: b256 = input_message_data(msg_idx, 32).into();
        let len = input_message_data_length(msg_idx);

        let mut msg_data = Self {
            amount: ZERO_B256,
            from: ZERO_B256,
            len,
            token,
            to: Identity::Address(Address::from(ZERO_B256)),
        };

        // TODO: Bug, have to mutate this struct for these values or tests fail
        msg_data.amount = input_message_data(msg_idx, 32 + 32 + 32 + 32).into();
        msg_data.from = input_message_data(msg_idx, 32 + 32).into();
        let to: b256 = input_message_data(msg_idx, 32 + 32 + 32).into();

        if msg_data.len > 160u16 {
            msg_data.to = Identity::ContractId(ContractId::from(to));
        } else {
            msg_data.to = Identity::Address(Address::from(to));
        }

        msg_data
    }
}
