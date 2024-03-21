library;
use ::data_structures::{deposit_message::DepositMessage, metadata_message::MetadataMessage};
use std::{constants::ZERO_B256, inputs::{input_message_data, input_message_data_length}};

pub enum MessageData {
    Deposit: DepositMessage,
    Metadata: MetadataMessage,
}

pub const DEPOSIT: u8 = 0;
pub const METADATA: u8 = 1;
const OFFSET_MESSAGE_TYPE: u64 = 32;

impl MessageData {
    pub fn parse(msg_idx: u64) -> Self {
        let message_type: u8 = input_message_data(msg_idx, OFFSET_MESSAGE_TYPE).get(0).unwrap();

        if message_type == DEPOSIT {
            MessageData::Deposit(DepositMessage::parse(msg_idx))
        } else {
            MessageData::Metadata(MetadataMessage::parse(msg_idx))
        }
    }
}
