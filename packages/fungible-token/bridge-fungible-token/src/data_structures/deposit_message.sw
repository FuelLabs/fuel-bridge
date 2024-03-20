library;

use std::{constants::ZERO_B256, inputs::{input_message_data, input_message_data_length}};

/// A message is encoded as
/// 0x00 => CONTRACT_ID
/// 0x20 => MESSAGE_TYPE
/// 0x28 and onwards: payload, with offsets defined as below
const OFFSET_MESSAGE_TYPE: u64 = 32;
const OFFSET_TOKEN_ADDRESS: u64 = OFFSET_MESSAGE_TYPE + 1;
const OFFSET_TOKEN_ID: u64 = OFFSET_TOKEN_ADDRESS + 32;
const OFFSET_FROM: u64 = OFFSET_TOKEN_ID + 32;
const OFFSET_TO: u64 = OFFSET_FROM + 32;
const OFFSET_AMOUNT: u64 = OFFSET_TO + 32;
const OFFSET_DECIMALS: u64 = OFFSET_AMOUNT + 32;
pub const ADDRESS_DEPOSIT_DATA_LEN: u64 = OFFSET_DECIMALS + 1;
pub const CONTRACT_DEPOSIT_WITHOUT_DATA_LEN: u64 = ADDRESS_DEPOSIT_DATA_LEN + 1u64;

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
// 0100000000000000000000000000000000000000000000000000000000deadbeef00000000000000000000000000000000000000000000000000000000000000000000000000000000000000008888888888888888888888888888888888888888b1c6067c6663708d831ef3d10edf0aa4d6c14f077fc7f41f5535a30435e7cd7800000000000000000000000000000000000000003b9ac9ffffffffffc465360012
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
            deposit_and_call: false
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
