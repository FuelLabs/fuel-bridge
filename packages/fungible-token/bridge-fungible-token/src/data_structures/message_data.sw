library;
use ::data_structures::{
    constants::{
        CONTRACT_DEPOSIT,
        CONTRACT_DEPOSIT_WITH_DATA,
        DEPOSIT,
        METADATA,
        OFFSET_MESSAGE_TYPE,
    },
    deposit_message::DepositMessage,
    metadata_message::MetadataMessage,
};
use std::{constants::ZERO_B256, inputs::{input_message_data, input_message_data_length}};

pub enum MessageData {
    Deposit: DepositMessage,
    Metadata: MetadataMessage,
}

impl MessageData {
    pub fn parse(msg_idx: u64) -> Self {
        let message_type: u8 = input_message_data(msg_idx, OFFSET_MESSAGE_TYPE).get(0).unwrap();

        match message_type {
            DEPOSIT => MessageData::Deposit(DepositMessage::parse_deposit_to_address(msg_idx)),
            CONTRACT_DEPOSIT => MessageData::Deposit(DepositMessage::parse_deposit_to_contract(msg_idx)),
            CONTRACT_DEPOSIT_WITH_DATA => MessageData::Deposit(DepositMessage::parse_deposit_to_contract_with_data(msg_idx)),
            METADATA => MessageData::Metadata(MetadataMessage::parse(msg_idx)),
            _ => revert(0),
        }
    }
}
