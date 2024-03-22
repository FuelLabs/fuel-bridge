library;

use std::{constants::ZERO_B256, inputs::{input_message_data, input_message_data_length}};
use ::data_structures::{
    constants::{
        OFFSET_MESSAGE_TYPE,
        OFFSET_TOKEN_ADDRESS,
        OFFSET_TOKEN_ID,
        OFFSET_FROM,
        OFFSET_TO,
        OFFSET_AMOUNT,
        OFFSET_DECIMALS,
        ADDRESS_DEPOSIT_DATA_LEN,
        CONTRACT_DEPOSIT_WITHOUT_DATA_LEN
    }
};

pub struct DepositMessage {
    pub amount: b256,
    pub from: b256,
    pub len: u64,
    pub to: Identity,
    pub token_address: b256,
    pub token_id: b256,
    pub decimals: u8,
    pub deposit_and_call: bool,
}

impl DepositMessage {
    /// Read the bytes passed as message data into an in-memory representation using the DepositMessage type.
    ///
    /// any data beyond ADDRESS_DEPOSIT_DATA_LEN bytes means deposit is meant for a contract.
    /// if data is > CONTRACT_DEPOSIT_WITHOUT_DATA_LEN bytes, then we also need to call process_message on the destination contract.
    pub fn parse(msg_idx: u64) -> Self {
        let token_address: b256 = input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).into();
        let len: u64 = input_message_data_length(msg_idx).as_u64();

        let mut msg_data = Self {
            amount: ZERO_B256,
            from: ZERO_B256,
            len,
            token_address,
            to: Identity::Address(Address::from(ZERO_B256)),
            token_id: ZERO_B256,
            decimals: 0u8,
            deposit_and_call: false,
        };

        // TODO: Bug, have to mutate this struct for these values or tests fail
        msg_data.amount = input_message_data(msg_idx, OFFSET_AMOUNT).into();
        msg_data.from = input_message_data(msg_idx, OFFSET_FROM).into();
        msg_data.token_id = input_message_data(msg_idx, OFFSET_TOKEN_ID).into();
        msg_data.decimals = input_message_data(msg_idx, OFFSET_DECIMALS).get(0).unwrap();

        let to: b256 = input_message_data(msg_idx, OFFSET_TO).into();

        if len == ADDRESS_DEPOSIT_DATA_LEN {
            msg_data.to = Identity::Address(Address::from(to));
        } else if len == CONTRACT_DEPOSIT_WITHOUT_DATA_LEN {
            msg_data.to = Identity::ContractId(ContractId::from(to));
        } else {
            msg_data.to = Identity::ContractId(ContractId::from(to));
            msg_data.deposit_and_call = true;
        }

        msg_data
    }
}
