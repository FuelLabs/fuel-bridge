library;

use ::data_structures::deposit_message::DepositMessage;
use ::errors::BridgeFungibleTokenError;
use ::events::DepositEvent;
use std::{
    bytes::Bytes,
    constants::ZERO_B256,
    flags::{
        disable_panic_on_overflow,
        enable_panic_on_overflow,
    },
    inputs::{
        input_message_data,
        input_message_data_length,
    },
    math::*,
};

const TEN: u256 = 10;

/// Adjust decimals(precision) on a withdrawal amount to match the originating token decimals
/// or return an error if the conversion can't be achieved without overflow/underflow.
pub fn adjust_withdrawal_decimals(
    val: u64,
    decimals: u8,
    bridged_token_decimals: u8,
) -> Result<b256, BridgeFungibleTokenError> {
    let value: u256 = val.as_u256();

    let adjusted: u256 = if bridged_token_decimals > decimals {
        match shift_decimals_left(value, bridged_token_decimals - decimals) {
            Result::Err(e) => return Result::Err(e),
            Result::Ok(v) => v,
        }
    } else if bridged_token_decimals < decimals {
        match shift_decimals_right(value, decimals - bridged_token_decimals) {
            Result::Err(e) => return Result::Err(e),
            Result::Ok(v) => v,
        }
    } else {
        value
    };

    Result::Ok(adjusted.as_b256())
}

/// Adjust decimals(precision) on a deposit amount to match this proxy tokens decimals
/// or return an error if the conversion can't be achieved without overflow/underflow.
pub fn adjust_deposit_decimals(
    val: b256,
    decimals: u8,
    bridged_token_decimals: u8,
) -> Result<u64, BridgeFungibleTokenError> {
    let value = val.as_u256();

    let adjusted: u256 = if bridged_token_decimals > decimals {
        let result = shift_decimals_right(value, bridged_token_decimals - decimals);
        match result {
            Result::Err(e) => return Result::Err(e),
            Result::Ok(v) => v,
        }
    } else if bridged_token_decimals < decimals {
        let result = shift_decimals_left(value, decimals - bridged_token_decimals);
        match result {
            Result::Err(e) => return Result::Err(e),
            Result::Ok(v) => v,
        }
    } else {
        value
    };

    let (word1, word2, word3, word4) = asm(r1: adjusted.as_b256()) {
        r1: (u64, u64, u64, u64)
    };

    if word1 == 0 && word2 == 0 && word3 == 0 {
        Result::Ok(word4)
    } else {
        Result::Err(BridgeFungibleTokenError::OverflowError)
    }
}

/// Encode the data to be passed out of the contract when sending a message
pub fn encode_data(to: b256, amount: b256, bridged_token: b256, token_id: b256) -> Bytes {
    // capacity is 4 + 32 + 32 + 32 + 32 = 132
    let mut data = Bytes::with_capacity(132);

    // first, we push the selector 1 byte at a time
    // the function selector for finalizeWithdrawal on the base layer gateway contract:
    // finalizeWithdrawal(address,address,uint256,uint256) = 0x64a7fad9
    data.push(0x64u8);
    data.push(0xa7u8);
    data.push(0xfau8);
    data.push(0xd9u8);

    data.append(Bytes::from(to));
    data.append(Bytes::from(bridged_token));
    data.append(Bytes::from(amount));
    data.append(Bytes::from(token_id));

    data
}

pub fn encode_register_calldata(bridged_token: b256) -> Bytes {
    let mut data = Bytes::with_capacity(36);

    // First 4 bytes are funcSig: aec97dc6  =>  registerAsReceiver(address)  
    data.push(0xaeu8);
    data.push(0xc9u8);
    data.push(0x7du8);
    data.push(0xc6u8);

    // Now the parameters
    data.append(Bytes::from(bridged_token));

    data
}

fn shift_decimals_left(bn: u256, decimals: u8) -> Result<u256, BridgeFungibleTokenError> {
    let mut bn_clone = bn;
    let mut decimals_to_shift = decimals.as_u32();

    // the zero case
    if (decimals_to_shift == 0) {
        return Result::Ok(bn_clone);
    }

    // the too large case
    // (there are only 78 decimal digits in a 256bit number)
    if (decimals_to_shift > 77) {
        return Result::Err(BridgeFungibleTokenError::OverflowError);
    }

    let adjusted = bn_clone * TEN.pow(decimals_to_shift);

    Result::Ok(adjusted)
}

fn shift_decimals_right(bn: u256, decimals: u8) -> Result<u256, BridgeFungibleTokenError> {
    let mut bn_clone = bn;
    let mut decimals_to_shift: u32 = asm(r1: decimals) {
        r1: u32
    };

    // the zero case
    if (decimals_to_shift == 0u32) {
        return Result::Ok(bn_clone);
    }

    // the too large case
    // (there are only 78 decimal digits in a 256bit number)
    if (decimals_to_shift > 77u32) {
        return Result::Err(BridgeFungibleTokenError::UnderflowError);
    }

    let base = TEN.pow(decimals_to_shift);
    let adjusted = bn_clone / (TEN.pow(decimals_to_shift));
    let check = (bn_clone + base - 0x01_u256) / base;

    // TODO: Convoluted way of checking modulo, workaround for modulo issues around u256
    if check != adjusted {
        return Result::Err(BridgeFungibleTokenError::UnderflowError);
    }

    return Result::Ok(adjusted)
}
