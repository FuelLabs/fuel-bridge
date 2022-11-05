library utils;

dep errors;
dep events;
dep data;

use std::{constants::ZERO_B256, math::*, u256::U256, vec::Vec};

use errors::BridgeFungibleTokenError;
use data::MessageData;

// the function selector for finalizeWithdrawal on the L1ERC20Gateway contract:
// finalizeWithdrawal(address,address,uint256)
const FINALIZE_WITHDRAWAL_SELECTOR: u64 = 0x53ef146100000000;

// TODO: [std-lib] remove once standard library functions have been added
const GTF_INPUT_MESSAGE_DATA_LENGTH = 0x11B;
const GTF_INPUT_MESSAGE_DATA = 0x11E;
const GTF_INPUT_MESSAGE_SENDER = 0x115;
const GTF_INPUT_MESSAGE_RECIPIENT = 0x116;

/// Make any necessary adjustments to decimals(precision) on the amount
/// to be withdrawn. This amount needs to be passed via message.data as a b256
pub fn adjust_withdrawal_decimals(val: u64) -> b256 {
    if DECIMALS < LAYER_1_DECIMALS {
        let amount = U256::from((0, 0, 0, val));
        let factor = U256::from((0, 0, 0, 10.pow(LAYER_1_DECIMALS - DECIMALS)));
        let components = amount.multiply(factor).into();
        compose(components)
    } else {
        // Either decimals are the same, or decimals are negative.
        // TODO: Decide how to handle negative decimals before mainnet.
        // For now we make no decimal adjustment for either case.
        compose((0, 0, 0, val))
    }
}

/// Make any necessary adjustments to decimals(precision) on the deposited value, and return either a converted u64 or an error if the conversion can't be achieved without overflow or loss of precision.
pub fn adjust_deposit_decimals(msg_val: b256) -> Result<u64, BridgeFungibleTokenError> {
    let decomposed = decompose(msg_val);
    let value = U256::from((decomposed.0, decomposed.1, decomposed.2, decomposed.3));

    if LAYER_1_DECIMALS > DECIMALS {
        let adjustment_factor = U256::from((0, 0, 0, 10.pow(LAYER_1_DECIMALS - DECIMALS)));
        if value.divide(adjustment_factor).multiply(adjustment_factor) == value
            && (value.gt(adjustment_factor)
            || value.eq(adjustment_factor))
        {
            let adjusted = value.divide(adjustment_factor);
            let val_result = adjusted.as_u64();
            match val_result {
                Result::Err(e) => {
                    Result::Err(BridgeFungibleTokenError::BridgedValueIncompatability)
                },
                Result::Ok(val) => {
                    Result::Ok(val)
                },
            }
        } else {
            Result::Err(BridgeFungibleTokenError::BridgedValueIncompatability)
        }
    } else {
        // Either decimals are the same, or decimals are negative.
        // TODO: Decide how to handle negative decimals before mainnet.
        // For now we make no decimal adjustment for either case.
        let val_result = value.as_u64();
        match val_result {
            Result::Err(e) => {
                Result::Err(BridgeFungibleTokenError::BridgedValueIncompatability)
            },
            Result::Ok(val) => {
                Result::Ok(val)
            },
        }
    }
}

/// Build a single b256 value from a tuple of 4 u64 values.
pub fn compose(words: (u64, u64, u64, u64)) -> b256 {
    asm(r1: __addr_of(words)) { r1: b256 }
}

/// Get a tuple of 4 u64 values from a single b256 value.
pub fn decompose(val: b256) -> (u64, u64, u64, u64) {
    asm(r1: __addr_of(val)) { r1: (u64, u64, u64, u64) }
}

/// Read the bytes passed as message data into an in-memory representation using the MessageData type.
pub fn parse_message_data(msg_idx: u8) -> MessageData {
    let mut msg_data = MessageData {
        fuel_token: ContractId::from(ZERO_B256),
        l1_asset: ZERO_B256,
        from: ZERO_B256,
        to: Address::from(ZERO_B256),
        amount: ZERO_B256,
    };

    // Parse the message data
    msg_data.fuel_token = ContractId::from(input_message_data::<b256>(msg_idx, 0));
    msg_data.l1_asset = input_message_data::<b256>(msg_idx, 8);
    msg_data.from = input_message_data::<b256>(msg_idx, 8 + 8);
    msg_data.to = Address::from(input_message_data::<b256>(msg_idx, 8 + 8 + 8));
    msg_data.amount = input_message_data::<b256>(msg_idx, 8 + 8 + 8 + 8);
    msg_data
}

/// Encode the data to be passed out of the contract when sending a message
pub fn encode_data(to: b256, amount: b256) -> Vec<u64> {
    let mut data = Vec::with_capacity(13);
    let (recip_1, recip_2, recip_3, recip_4) = decompose(to);
    let (token_1, token_2, token_3, token_4) = decompose(LAYER_1_TOKEN);
    let (amount_1, amount_2, amount_3, amount_4) = decompose(amount);

    // start with the function selector
    data.push(FINALIZE_WITHDRAWAL_SELECTOR + (recip_1 >> 32));

    // add the address to recieve coins
    data.push((recip_1 << 32) + (recip_2 >> 32));
    data.push((recip_2 << 32) + (recip_3 >> 32));
    data.push((recip_3 << 32) + (recip_4 >> 32));
    data.push((recip_4 << 32) + (token_1 >> 32));

    // add the address of the L1 token contract
    data.push((token_1 << 32) + (token_2 >> 32));
    data.push((token_2 << 32) + (token_3 >> 32));
    data.push((token_3 << 32) + (token_4 >> 32));
    data.push((token_4 << 32) + (amount_1 >> 32));

    // add the amount of tokens
    data.push((amount_1 << 32) + (amount_2 >> 32));
    data.push((amount_2 << 32) + (amount_3 >> 32));
    data.push((amount_3 << 32) + (amount_4 >> 32));
    data.push(amount_4 << 32);
    data
}

/// Get the data of a message input
// TODO: [std-lib] replace with 'input_message_data'
pub fn input_message_data<T>(index: u64, offset: u64) -> T {
    let data = __gtf::<raw_ptr>(index, GTF_INPUT_MESSAGE_DATA);
    let data_with_offset = data.add(offset / 8);
    data_with_offset.read::<T>()
}

/// Get the sender of the input message at `index`.
// TODO: [std-lib] replace with 'input_message_sender'
pub fn input_message_sender(index: u64) -> Address {
    Address::from(__gtf::<b256>(index, GTF_INPUT_MESSAGE_SENDER))
}
