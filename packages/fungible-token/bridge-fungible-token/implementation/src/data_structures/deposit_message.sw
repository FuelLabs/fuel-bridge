library;

use std::inputs::input_message_data;
use ::data_structures::constants::{
    CONTRACT_DEPOSIT,
    CONTRACT_DEPOSIT_WITH_DATA,
    DEPOSIT,
    OFFSET_AMOUNT,
    OFFSET_DECIMALS,
    OFFSET_FROM,
    OFFSET_MESSAGE_TYPE,
    OFFSET_TO,
    OFFSET_TOKEN_ADDRESS,
    OFFSET_TOKEN_ID,
};
pub enum DepositType {
    Address: (),
    Contract: (),
    ContractWithData: (),
}
pub struct DepositMessage {
    pub amount: b256,
    pub from: b256,
    pub to: Identity,
    pub token_address: b256,
    pub token_id: b256,
    pub decimals: u8,
    pub deposit_type: DepositType,
}
impl DepositMessage {
    /// Read the bytes passed as message data into an in-memory representation using the DepositMessage type
    pub fn parse_deposit_to_address(msg_idx: u64) -> Self {
        Self {
            amount: input_message_data(msg_idx, OFFSET_AMOUNT).unwrap().into(),
            from: input_message_data(msg_idx, OFFSET_FROM).unwrap().into(),
            token_address: input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).unwrap().into(),
            to: Identity::Address(Address::from(b256::from(input_message_data(msg_idx, OFFSET_TO).unwrap()))),
            token_id: input_message_data(msg_idx, OFFSET_TOKEN_ID).unwrap().into(),
            decimals: input_message_data(msg_idx, OFFSET_DECIMALS).unwrap().get(31).unwrap(),
            deposit_type: DepositType::Address,
        }
    }
    /// Read the bytes passed as message data into an in-memory representation using the DepositMessage type
    pub fn parse_deposit_to_contract(msg_idx: u64) -> Self {
        Self {
            amount: input_message_data(msg_idx, OFFSET_AMOUNT).unwrap().into(),
            from: input_message_data(msg_idx, OFFSET_FROM).unwrap().into(),
            token_address: input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).unwrap().into(),
            to: Identity::ContractId(ContractId::from(b256::from(input_message_data(msg_idx, OFFSET_TO).unwrap()))),
            token_id: input_message_data(msg_idx, OFFSET_TOKEN_ID).unwrap().into(),
            decimals: input_message_data(msg_idx, OFFSET_DECIMALS).unwrap().get(31).unwrap(),
            deposit_type: DepositType::Contract,
        }
    }
    /// Read the bytes passed as message data into an in-memory representation using the DepositMessage type
    pub fn parse_deposit_to_contract_with_data(msg_idx: u64) -> Self {
        Self {
            amount: input_message_data(msg_idx, OFFSET_AMOUNT).unwrap().into(),
            from: input_message_data(msg_idx, OFFSET_FROM).unwrap().into(),
            token_address: input_message_data(msg_idx, OFFSET_TOKEN_ADDRESS).unwrap().into(),
            to: Identity::ContractId(ContractId::from(b256::from(input_message_data(msg_idx, OFFSET_TO).unwrap()))),
            token_id: input_message_data(msg_idx, OFFSET_TOKEN_ID).unwrap().into(),
            decimals: input_message_data(msg_idx, OFFSET_DECIMALS).unwrap().get(31).unwrap(),
            deposit_type: DepositType::ContractWithData,
        }
    }
}
