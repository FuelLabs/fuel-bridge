library;

use ::cast::*;
use ::data_structures::MessageData;
use ::errors::BridgeFungibleTokenError;
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
    u256::U256,
};

/// Adjust decimals(precision) on a withdrawal amount to match the originating token decimals
/// or return an error if the conversion can't be achieved without overflow/underflow.
pub fn adjust_withdrawal_decimals(
    val: u64,
    decimals: u8,
    bridged_token_decimals: u8,
) -> Result<b256, BridgeFungibleTokenError> {
    let value = U256::from((0, 0, 0, val));
    let adjusted = if bridged_token_decimals > decimals {
        match shift_decimals_left(value, bridged_token_decimals - decimals) {
            Result::Err(e) => return Result::Err(e),
            Result::Ok(v) => {
                let components: (u64, u64, u64, u64) = v.into();
                components
            },
        }
    } else if bridged_token_decimals < decimals {
        match shift_decimals_right(value, decimals - bridged_token_decimals) {
            Result::Err(e) => return Result::Err(e),
            Result::Ok(v) => {
                let components: (u64, u64, u64, u64) = v.into();
                components
            },
        }
    } else {
        (0, 0, 0, val)
    };

    Result::Ok(compose(adjusted))
}

/// Adjust decimals(precision) on a deposit amount to match this proxy tokens decimals
/// or return an error if the conversion can't be achieved without overflow/underflow.
pub fn adjust_deposit_decimals(
    val: b256,
    decimals: u8,
    bridged_token_decimals: u8,
) -> Result<u64, BridgeFungibleTokenError> {
    let value = U256::from(val);
    let adjusted = if bridged_token_decimals > decimals {
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

    match adjusted.as_u64() {
        Result::Err(_) => Result::Err(BridgeFungibleTokenError::OverflowError),
        Result::Ok(v) => Result::Ok(v),
    }
}

/// Encode the data to be passed out of the contract when sending a message
pub fn encode_data(to: b256, amount: b256, bridged_token: b256, token_id: b256) -> Bytes {
    // capacity is 4 + 32 + 32 + 32 + 32 = 132
    let mut data = Bytes::with_capacity(132);

    // first, we push the selector 1 byte at a time
    // the function selector for finalizeWithdrawal on the base layer gateway contract:
    // finalizeWithdrawal(address,address,uint256,bytes32) = 0x64a7fad9
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

fn shift_decimals_left(bn: U256, decimals: u8) -> Result<U256, BridgeFungibleTokenError> {
    let mut bn_clone = bn;
    let mut decimals_to_shift = asm(r1: decimals) { r1: u64 };

    // the zero case
    if (decimals_to_shift == 0) {
        return Result::Ok(bn_clone);
    }

    // the too large case
    // (there are only 78 decimal digits in a 256bit number)
    if (decimals_to_shift > 77) {
        return Result::Err(BridgeFungibleTokenError::OverflowError);
    }

    // shift decimals in increments of the max power of 10 that bn_mult will allow (10^19)
    while (decimals_to_shift > 19) {
        // note: 10_000_000_000_000_000_000 = 10.pow(19)
        let (adjusted, overflow) = bn_mult(bn_clone, 10_000_000_000_000_000_000);
        if (overflow != 0) {
            return Result::Err(BridgeFungibleTokenError::OverflowError);
        };
        decimals_to_shift = decimals_to_shift - 19;
        bn_clone = adjusted;
    }

    let (adjusted, overflow) = bn_mult(bn_clone, 10.pow(decimals_to_shift));
    if (overflow != 0) {
        return Result::Err(BridgeFungibleTokenError::OverflowError);
    }
    Result::Ok(adjusted)
}

fn shift_decimals_right(bn: U256, decimals: u8) -> Result<U256, BridgeFungibleTokenError> {
    let mut bn_clone = bn;
    let mut decimals_to_shift: u32 = asm(r1: decimals) { r1: u32 };

    // the zero case
    if (decimals_to_shift == 0u32) {
        return Result::Ok(bn_clone);
    }

    // the too large case
    // (there are only 78 decimal digits in a 256bit number)
    if (decimals_to_shift > 77u32) {
        return Result::Err(BridgeFungibleTokenError::UnderflowError);
    }

    // shift decimals in increments of the max power of 10 that bn_div will allow (10^9)
    while (decimals_to_shift > 9u32) {
        // note: 1_000_000_000 = 10.pow(9)
        let (adjusted, remainder) = bn_div(bn_clone, 1_000_000_000u32);
        if remainder != 0u32 {
            return Result::Err(BridgeFungibleTokenError::UnderflowError);
        };
        decimals_to_shift = decimals_to_shift - 9u32;
        bn_clone = adjusted;
    }
    let (adjusted, remainder) = bn_div(bn_clone, 10u32.pow(decimals_to_shift));
    if remainder != 0u32 {
        return Result::Err(BridgeFungibleTokenError::UnderflowError);
    }
    return Result::Ok(adjusted)
}

/// Build a single b256 value from a tuple of 4 u64 values.
fn compose(words: (u64, u64, u64, u64)) -> b256 {
    asm(r1: __addr_of(words)) { r1: b256 }
}

// TODO: [std-lib] replace when added as a method to U128/U256
fn bn_mult(bn: U256, factor: u64) -> (U256, u64) {
    disable_panic_on_overflow();
    let result = U256::new();
    let result = asm(bn: __addr_of(bn), factor: factor, carry_0, carry_1, value, product, sum, result: __addr_of(result)) {
        // Run multiplication on the lower 64bit word
        lw   value bn i3; // load the word in (bn + 3 words) into value
        mul  product value factor; // mult value * factor and save in product
        move carry_0 of; // record the carry
        sw   result product i3;

        // Run multiplication on the next 64bit word
        lw   value bn i2; // load the word in (bn + 2 words) into value
        mul  product value factor; // mult value * factor and save in product
        move carry_1 of; // record the carry
        add  sum product carry_0; // add previous carry + product
        add  carry_0 carry_1 of; // record the total new carry
        sw   result sum i2;

        // Run multiplication on the next 64bit word
        lw   value bn i1; // load the word in (bn + 1 words) into value
        mul  product value factor; // mult value * factor and save in product
        move carry_1 of; // record the carry
        add  sum product carry_0; // add previous carry + product
        add  carry_0 carry_1 of; // record the total new carry
        sw   result sum i1;

        // Run multiplication on the next 64bit word
        lw   value bn i0; // load the word in bn into value
        mul  product value factor; // mult value * factor and save in product
        move carry_1 of; // record the carry
        add  sum product carry_0; // add previous carry + product
        add  carry_0 carry_1 of; // record the total new carry
        move carry_1 of; // record any overflow
        sw   result sum i0;
        sw   result carry_0 i4;

        result: (U256, u64)
    };
    enable_panic_on_overflow();
    result
}

// TODO: [std-lib] replace when added as a method to U128/U256
fn bn_div(bn: U256, decimals: u32) -> (U256, u32) {
    let bn_clone = bn;
    // bit mask to isolate the lower 32 bits of each word
    let mask: u64 = 0x00000000FFFFFFFF;
    let result = (U256::new(), 0u32);
    asm(bn: __addr_of(bn_clone), decimals: decimals, m: mask, r0, r1, r2, r3, v0, v1, sum_1, sum_2, q, result: __addr_of(result)) {
        // The upper 64bits can just be divided normal
        lw   v0 bn i0;
        mod  r0 v0 decimals; // record the remainder
        div  q v0 decimals;
        sw   result q i0;

        // The next 64bits are broken into 2 32bit numbers
        lw   v0 bn i1;
        and  v1 v0 m;
        srli v0 v0 i32;
        slli r1 r0 i32; // the previous remainder is shifted up and added before next division
        add  v0 r1 v0;
        mod  r2 v0 decimals; // record the remainder
        div  v0 v0 decimals;
        slli r3 r2 i32; // the previous remainder is shifted up and added before next division
        add  sum_1 r3 v1;
        mod  r0 sum_1 decimals; // record the remainder
        div  q sum_1 decimals;
        slli v0 v0 i32; // re-combine the 2 32bit numbers
        add  sum_2 v0 q;
        sw   result sum_2 i1;

        // The next 64bits are broken into 2 32bit numbers
        lw   v0 bn i2;
        and  v1 v0 m;
        srli v0 v0 i32;
        slli r1 r0 i32; // the previous remainder is shifted up and added before next division
        add  v0 r1 v0;
        mod  r2 v0 decimals; // record the remainder
        div  v0 v0 decimals;
        slli r3 r2 i32; // the previous remainder is shifted up and added before next division
        add  v1 r3 v1;
        mod  r0 v1 decimals; // record the remainder
        div  v1 v1 decimals;
        slli v0 v0 i32; // re-combine the 2 32bit numbers
        add  v0 v0 v1;
        sw   result v0 i2;

        // The next 64bits are broken into 2 32bit numbers
        lw   v0 bn i3;
        and  v1 v0 m;
        srli v0 v0 i32;
        slli r1 r0 i32; // the previous remainder is shifted up and added before next division
        add  v0 r1 v0;
        mod  r2 v0 decimals; // record the remainder
        div  v0 v0 decimals;
        slli r3 r2 i32; // the previous remainder is shifted up and added before next division
        add  v1 r3 v1;
        mod  r0 v1 decimals; // record the remainder
        div  v1 v1 decimals;
        slli v0 v0 i32; // re-combine the 2 32bit numbers
        add  v0 v0 v1;
        sw   result v0 i3;
        sw   result r0 i4;

        result: (U256, u32)
    }
}
