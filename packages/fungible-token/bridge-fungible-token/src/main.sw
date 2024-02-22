contract;

mod cast;
mod data_structures;
mod errors;
mod events;
mod interface;
mod utils;

use cast::*;
use contract_message_receiver::MessageReceiver;
use errors::BridgeFungibleTokenError;
use data_structures::{ADDRESS_DEPOSIT_DATA_LEN, CONTRACT_DEPOSIT_WITHOUT_DATA_LEN, MessageData};
use events::{ClaimRefundEvent, DepositEvent, RefundRegisteredEvent, WithdrawalEvent};
use interface::{bridge::Bridge, src7::{Metadata, SRC7}};
use reentrancy::reentrancy_guard;
use std::{
    asset::{
        burn,
        mint,
        transfer,
    },
    call_frames::{
        contract_id,
        msg_asset_id,
    },
    constants::ZERO_B256,
    context::msg_amount,
    flags::{
        disable_panic_on_overflow,
        enable_panic_on_overflow,
    },
    hash::Hash,
    hash::sha256,
    inputs::input_message_sender,
    message::send_message,
    primitive_conversions::u64::*,
    string::String,
};
use utils::{
    adjust_deposit_decimals,
    adjust_withdrawal_decimals,
    encode_data,
    encode_register_calldata,
};
use src_20::SRC20;

const DEFAULT_DECIMALS: u8 = 9u8;
const DEFAULT_BRIDGED_TOKEN_DECIMALS: u8 = 18u8;

configurable {
    DECIMALS: u64 = 9u64,
    BRIDGED_TOKEN_DECIMALS: u64 = 18u64,
    BRIDGED_TOKEN_GATEWAY: b256 = 0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe,
    BRIDGED_TOKEN: b256 = 0x00000000000000000000000000000000000000000000000000000000deadbeef,
    NAME: str[64] = __to_str_array("MY_TOKEN                                                        "),
    SYMBOL: str[32] = __to_str_array("MYTKN                           "),
}

storage {
    asset_to_sub_id: StorageMap<AssetId, SubId> = StorageMap {},
    refund_amounts: StorageMap<b256, StorageMap<b256, b256>> = StorageMap {},
    tokens_minted: StorageMap<AssetId, u64> = StorageMap {},
    total_assets: u64 = 0,
}

// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u64) {
        // Protect against reentrancy attacks that could allow replaying messages
        reentrancy_guard();

        let input_sender = input_message_sender(msg_idx);
        require(
            input_sender
                .value == BRIDGED_TOKEN_GATEWAY,
            BridgeFungibleTokenError::UnauthorizedSender,
        );

        let message_data = MessageData::parse(msg_idx);
        require(
            message_data
                .amount != ZERO_B256,
            BridgeFungibleTokenError::NoCoinsSent,
        );

        // register a refund if tokens don't match
        if (message_data.token_address != BRIDGED_TOKEN) {
            register_refund(
                message_data
                    .from,
                message_data
                    .token_address,
                message_data
                    .token_id,
                message_data
                    .amount,
            );
            return;
        };

        let res_amount = adjust_deposit_decimals(message_data.amount, DECIMALS.try_as_u8().unwrap_or(DEFAULT_DECIMALS), BRIDGED_TOKEN_DECIMALS.try_as_u8().unwrap_or(DEFAULT_BRIDGED_TOKEN_DECIMALS));

        match res_amount {
            Result::Err(_) => {
                // register a refund if value can't be adjusted
                register_refund(
                    message_data
                        .from,
                    message_data
                        .token_address,
                    message_data
                        .token_id,
                    message_data
                        .amount,
                );
            },
            Result::Ok(amount) => {
                let sub_id = message_data.token_id;
                let asset_id = AssetId::new(contract_id(), sub_id);

                let _ = disable_panic_on_overflow();

                let current_total_supply = storage.tokens_minted.get(asset_id).try_read().unwrap_or(0);
                let new_total_supply = current_total_supply + amount;

                if new_total_supply < current_total_supply {
                    register_refund(
                        message_data
                            .from,
                        message_data
                            .token_address,
                        message_data
                            .token_id,
                        message_data
                            .amount,
                    );
                    return;
                }

                let _ = enable_panic_on_overflow();

                storage.tokens_minted.insert(asset_id, new_total_supply);

                if storage.asset_to_sub_id.get(asset_id).try_read().is_none()
                {
                    storage.asset_to_sub_id.insert(asset_id, sub_id);
                    storage
                        .total_assets
                        .write(storage.total_assets.try_read().unwrap_or(0) + 1);
                };

                // mint tokens & update storage
                mint(sub_id, amount);

                // when depositing to an address, msg_data.len is ADDRESS_DEPOSIT_DATA_LEN bytes.
                // when depositing to a contract, msg_data.len is CONTRACT_DEPOSIT_WITHOUT_DATA_LEN bytes.
                // If msg_data.len is > CONTRACT_DEPOSIT_WITHOUT_DATA_LEN bytes, 
                // we must call `process_message()` on the receiving contract, forwarding the newly minted coins with the call.
                match message_data.len {
                    ADDRESS_DEPOSIT_DATA_LEN => {
                        transfer(message_data.to, asset_id, amount);
                    },
                    CONTRACT_DEPOSIT_WITHOUT_DATA_LEN => {
                        transfer(message_data.to, asset_id, amount);
                    },
                    _ => {
                        if let Identity::ContractId(id) = message_data.to {
                            let dest_contract = abi(MessageReceiver, id.into());
                            dest_contract
                                .process_message {
                                    coins: amount,
                                    asset_id: asset_id.into(),
                                }(msg_idx);
                        };
                    },
                }

                log(DepositEvent {
                    to: message_data.to,
                    from: message_data.from,
                    amount: amount,
                });
            }
        }
    }
}

impl Bridge for Contract {
    fn register_bridge() {
        send_message(
            BRIDGED_TOKEN_GATEWAY,
            encode_register_calldata(BRIDGED_TOKEN),
            0,
        );
    }

    #[storage(read, write)]
    fn claim_refund(from: b256, token_address: b256, token_id: b256) {
        let asset = sha256((token_address, token_id));
        let amount = storage.refund_amounts.get(from).get(asset).try_read().unwrap_or(ZERO_B256);
        require(
            amount != ZERO_B256,
            BridgeFungibleTokenError::NoRefundAvailable,
        );

        // reset the refund amount to 0
        storage.refund_amounts.get(from).insert(asset, ZERO_B256);

        // send a message to unlock this amount on the base layer gateway contract
        send_message(
            BRIDGED_TOKEN_GATEWAY,
            encode_data(from, amount, token_address, token_id),
            0,
        );

        log(ClaimRefundEvent {
            amount,
            from,
            token_address,
            token_id,
        });
    }

    #[payable]
    #[storage(read, write)]
    fn withdraw(to: b256) {
        let amount = msg_amount();
        let asset_id = msg_asset_id();
        let sub_id = _asset_to_sub_id(asset_id);
        require(amount != 0, BridgeFungibleTokenError::NoCoinsSent);

        // attempt to adjust amount into base layer decimals and burn the sent tokens
        let adjusted_amount = adjust_withdrawal_decimals(amount, DECIMALS.try_as_u8().unwrap_or(DEFAULT_DECIMALS), BRIDGED_TOKEN_DECIMALS.try_as_u8().unwrap_or(DEFAULT_BRIDGED_TOKEN_DECIMALS)).unwrap();
        storage
            .tokens_minted
            .insert(
                asset_id,
                storage
                    .tokens_minted
                    .get(asset_id)
                    .read() - amount,
            );
        burn(sub_id, amount);

        // send a message to unlock this amount on the base layer gateway contract
        let sender = msg_sender().unwrap();
        send_message(
            BRIDGED_TOKEN_GATEWAY,
            encode_data(to, adjusted_amount, BRIDGED_TOKEN, sub_id),
            0,
        );
        log(WithdrawalEvent {
            to: to,
            from: sender,
            amount: amount,
        });
    }

    fn bridged_token() -> b256 {
        BRIDGED_TOKEN
    }

    fn bridged_token_decimals() -> u8 {
        BRIDGED_TOKEN_DECIMALS.try_as_u8().unwrap_or(DEFAULT_BRIDGED_TOKEN_DECIMALS)
    }

    fn bridged_token_gateway() -> b256 {
        BRIDGED_TOKEN_GATEWAY
    }

    #[storage(read)]
    fn asset_to_sub_id(asset_id: AssetId) -> SubId {
        _asset_to_sub_id(asset_id)
    }
}

impl SRC20 for Contract {
    #[storage(read)]
    fn total_assets() -> u64 {
        storage.total_assets.try_read().unwrap_or(0)
    }

    #[storage(read)]
    fn total_supply(asset: AssetId) -> Option<u64> {
        storage.tokens_minted.get(asset).try_read()
    }

    #[storage(read)]
    fn name(asset: AssetId) -> Option<String> {
        match storage.tokens_minted.get(asset).try_read() {
            Some(_) => Some(String::from_ascii_str(from_str_array(NAME))),
            None => None,
        }
    }

    #[storage(read)]
    fn symbol(asset: AssetId) -> Option<String> {
        match storage.tokens_minted.get(asset).try_read() {
            Some(_) => Some(String::from_ascii_str(from_str_array(SYMBOL))),
            None => None,
        }
    }

    #[storage(read)]
    fn decimals(asset: AssetId) -> Option<u8> {
        match storage.tokens_minted.get(asset).try_read() {
            Some(_) => Some(DECIMALS.try_as_u8().unwrap_or(DEFAULT_DECIMALS)),
            None => None,
        }
    }
}

impl SRC7 for Contract {
    // TODO: implement SRC-8
    #[storage(read)]
    fn metadata(asset: AssetId, _key: String) -> Option<Metadata> {
        let _todo = _asset_to_sub_id(asset);
        None
    }
}

// Storage-dependant private functions
#[storage(write)]
fn register_refund(
    from: b256,
    token_address: b256,
    token_id: b256,
    amount: b256,
) {
    let asset = sha256((token_address, token_id));

    let previous_amount = storage.refund_amounts.get(from).get(asset).try_read().unwrap_or(ZERO_B256).as_u256();
    let new_amount: b256 = (amount.as_u256() + previous_amount).into();

    storage.refund_amounts.get(from).insert(asset, new_amount);
    log(RefundRegisteredEvent {
        from,
        token_address,
        token_id,
        amount,
    });
}

#[storage(read)]
fn _asset_to_sub_id(asset_id: AssetId) -> SubId {
    let sub_id = storage.asset_to_sub_id.get(asset_id).try_read();
    require(sub_id.is_some(), BridgeFungibleTokenError::AssetNotFound);
    sub_id.unwrap()
}
