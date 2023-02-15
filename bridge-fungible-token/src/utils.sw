library utils;

dep errors;
dep events;
dep data;

use std::{
    bytes::Bytes,
    constants::ZERO_B256,
    flags::{
        disable_panic_on_overflow,
        enable_panic_on_overflow,
    },
    inputs::input_message_data,
    math::*,
    u256::U256,
};

use errors::BridgeFungibleTokenError;
use data::MessageData;

fn shift_decimals_left(bn: U256, d: u8) -> Result<U256, BridgeFungibleTokenError> {
    let mut bn_clone = bn;
    let mut decimals_to_shift = asm(r1: d) { r1: u64 };

    // the zero case
    if (decimals_to_shift == 0) {
        return Result::Ok(bn);
    };

    // the too large case
    // (there are only 78 decimal digits in a 256bit number)
    if (decimals_to_shift > 77) {
        return Result::Err(BridgeFungibleTokenError::OverflowError);
    };

    // math time
    while (decimals_to_shift > 0) {
        if (decimals_to_shift < 20) {
            let (prod, overflow) = bn_mult(bn_clone, 10.pow(decimals_to_shift));
            if (overflow != 0) {
                return Result::Err(BridgeFungibleTokenError::OverflowError);
            };
            return Result::Ok(prod);
        } else {
            let (prod, overflow) = bn_mult(bn_clone, 10.pow(19));
            if (overflow != 0) {
                return Result::Err(BridgeFungibleTokenError::OverflowError);
            };
            decimals_to_shift = decimals_to_shift - 19;
            bn_clone += prod;
        };
    };
    Result::Ok(bn_clone)
}

fn shift_decimals_right(bn: U256, d: u8) -> Result<U256, BridgeFungibleTokenError> {
    let mut bn_clone = bn;
    let mut decimals_to_shift: u32 = asm(r1: d) { r1: u32 };
    let mut r = 0u32;

    // the zero case
    if (decimals_to_shift == 0u32) {
        return Result::Ok(bn);
    };

    // the too large case
    // (there are only 78 decimal digits in a 256bit number)
    if (decimals_to_shift > 77u32) {
        return Result::Err(BridgeFungibleTokenError::OverflowError);
    };

    // math time
    while (decimals_to_shift > 0u32) {
        if (decimals_to_shift < 9u32) {
            let (adjusted, remainder) = bn_div(bn_clone, 10u32.pow(decimals_to_shift));
            if remainder != 0u32 {
                return Result::Err(BridgeFungibleTokenError::OverflowError);
            };
            return Result::Ok(adjusted);
        } else {
            // Note: 1_000_000_000u32 = 10u32.pow(9u32)
            let (adjusted, remainder) = bn_div(bn_clone, 1_000_000_000u32);
            decimals_to_shift = decimals_to_shift - 9u32;
            bn_clone = adjusted;
            if remainder != 0u32 {
                return Result::Err(BridgeFungibleTokenError::OverflowError);
            };
            return Result::Ok(adjusted);
        }
    };

    return Result::Err(BridgeFungibleTokenError::OverflowError);
}

/// Make any necessary adjustments to decimals(precision) on the amount
/// to be withdrawn. This amount needs to be passed via message.data as a b256
pub fn adjust_withdrawal_decimals(val: u64) -> b256 {
    if DECIMALS < LAYER_1_DECIMALS {
        let result = shift_decimals_left(U256::from((0, 0, 0, val)), LAYER_1_DECIMALS - DECIMALS);
        compose(result.unwrap().into())
    } else {
        // Either decimals are the same, or decimals are negative.
        // TODO: Decide how to handle negative decimals before mainnet.
        // For now we make no decimal adjustment for either case.
        compose((0, 0, 0, val))
    }
}

/// Make any necessary adjustments to decimals(precision) on the deposited value, and return either a converted u64 or an error if the conversion can't be achieved without overflow or loss of precision.
pub fn adjust_deposit_decimals(msg_val: b256) -> Result<u64, BridgeFungibleTokenError> {
    let value = U256::from(decompose(msg_val));

    if LAYER_1_DECIMALS > DECIMALS {
        let decimal_diff = LAYER_1_DECIMALS - DECIMALS;
        let result = shift_decimals_right(value, decimal_diff);

        // ensure that the value does not use higher precision than is bridgeable by this contract
        if result.is_err() {
            return Result::Err(BridgeFungibleTokenError::BridgedValueIncompatability);
        };

        let val_result = result.unwrap().as_u64();
        match val_result {
            Result::Err(e) => {
                Result::Err(BridgeFungibleTokenError::BridgedValueIncompatability)
            },
            Result::Ok(val) => {
                Result::Ok(val)
            },
        }
    } else {
        // Either decimals are the same, or L2 decimals > L1 Decimals.
        // TODO: Decide how to handle cases where L2 decimals > L1 Decimals before mainnet.
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
    msg_data.fuel_token = ContractId::from(input_message_data(msg_idx, 0).into());
    msg_data.l1_asset = input_message_data(msg_idx, 32).into();
    msg_data.from = input_message_data(msg_idx, 32 + 32).into();
    msg_data.to = Address::from(input_message_data(msg_idx, 32 + 32 + 32).into());
    msg_data.amount = input_message_data(msg_idx, 32 + 32 + 32 + 32).into();
    msg_data
}

fn copy_bytes(dest: raw_ptr, src: raw_ptr, len: u64, offset: u64) {
    asm(dst: dest, src: src, len: len) {
        mcp  dst src len;
    };
}

/// Encode the data to be passed out of the contract when sending a message
pub fn encode_data(to: b256, amount: b256) -> Bytes {
    // capacity is 4 + 32 + 32 + 32 = 100
    let mut data = Bytes::with_capacity(100);
    let padded_to_bytes = Bytes::from(to);
    let padded_token_bytes = Bytes::from(LAYER_1_TOKEN);
    let amount_bytes = Bytes::from(amount);

    // first, we push the selector 1 byte at a time
    // the function selector for finalizeWithdrawal on the L1ERC20Gateway contract:
    // finalizeWithdrawal(address,address,uint256) = 0x53ef1461
    data.push(0x53u8);
    data.push(0xefu8);
    data.push(0x14u8);
    data.push(0x61u8);

    // next, we append the `to` address including padding:
    data.append(padded_to_bytes);

    // next, we append the `LAYER_1_TOKEN` address including padding:
    data.append(padded_token_bytes);

    // next, we append the `amount`:
    data.append(amount_bytes);

    data
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
fn bn_div(bn: U256, d: u32) -> (U256, u32) {
    // bit mask to isolate the lower 32 bits of each word
    let mask: u64 = 0x00000000FFFFFFFF;
    let result = (U256::new(), 0u32);
    asm(bn: __addr_of(bn), d: d, m: mask, r0, r1, r2, r3, v0, v1, sum_1, sum_2, q, result: __addr_of(result)) {
		// The upper 64bits can just be divided normal
        lw   v0 bn i0;
        mod  r0 v0 d; // record the remainder
        div  q v0 d;
        sw   result q i0;

        // The next 64bits are broken into 2 32bit numbers
        lw   v0 bn i1;
        and  v1 v0 m;
        srli v0 v0 i32;
        slli r1 r0 i32; // the previous remainder is shifted up and added before next division
        add  v0 r1 v0;
        mod  r2 v0 d; // record the remainder
        div  v0 v0 d;
        slli r3 r2 i32; // the previous remainder is shifted up and added before next division
        add  sum_1 r3 v1;
        mod  r0 sum_1 d; // record the remainder
        div  q sum_1 d;
        slli v0 v0 i32; // re-combine the 2 32bit numbers
        add  sum_2 v0 q;
        sw   result sum_2 i1;

        // The next 64bits are broken into 2 32bit numbers
        lw   v0 bn i2;
        and  v1 v0 m;
        srli v0 v0 i32;
        slli r1 r0 i32; // the previous remainder is shifted up and added before next division
        add  v0 r1 v0;
        mod  r2 v0 d; // record the remainder
        div  v0 v0 d;
        slli r3 r2 i32; // the previous remainder is shifted up and added before next division
        add  v1 r3 v1;
        mod  r0 v1 d; // record the remainder
        div  v1 v1 d;
        slli v0 v0 i32; // re-combine the 2 32bit numbers
        add  v0 v0 v1;
        sw   result v0 i2;

        // The next 64bits are broken into 2 32bit numbers
        lw   v0 bn i3;
        and  v1 v0 m;
        srli v0 v0 i32;
        slli r1 r0 i32; // the previous remainder is shifted up and added before next division
        add  v0 r1 v0;
        mod  r2 v0 d; // record the remainder
        div  v0 v0 d;
        slli r3 r2 i32; // the previous remainder is shifted up and added before next division
        add  v1 r3 v1;
        mod  r0 v1 d; // record the remainder
        div  v1 v1 d;
        slli v0 v0 i32; // re-combine the 2 32bit numbers
        add  v0 v0 v1;
        sw   result v0 i3;
        sw   result r0 i4;

        result: (U256, u32)
    }
}
