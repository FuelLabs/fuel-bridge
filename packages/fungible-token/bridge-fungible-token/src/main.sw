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
use data_structures::MessageData;
use events::{DepositEvent, RefundRegisteredEvent, WithdrawalEvent};
use interface::{FRC20, FungibleBridge};
use reentrancy::reentrancy_guard;
use std::{
    call_frames::{
        contract_id,
        msg_asset_id,
    },
    constants::ZERO_B256,
    context::msg_amount,
    inputs::input_message_sender,
    message::send_message,
    token::{
        burn,
        mint,
        transfer,
    },
    u256::U256,
};
use utils::{adjust_deposit_decimals, adjust_withdrawal_decimals, encode_data};

configurable {
    DECIMALS: u8 = 9u8,
    BRIDGED_TOKEN_DECIMALS: u8 = 18u8,
    BRIDGED_TOKEN_GATEWAY: b256 = 0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe,
    BRIDGED_TOKEN: b256 = 0x00000000000000000000000000000000000000000000000000000000deadbeef,
    NAME: str[64] = "MY_TOKEN                                                        ",
    SYMBOL: str[32] = "MYTKN                           ",
}

storage {
    refund_amounts: StorageMap<b256, StorageMap<b256, b256>> = StorageMap {},
    tokens_minted: u64 = 0,
}

// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[payable]
    #[storage(read, write)]
    fn process_message(msg_idx: u8) {
        // Protect against reentrancy attacks that could allow replaying messages
        reentrancy_guard();

        let input_sender = input_message_sender(msg_idx);
        require(input_sender.value == BRIDGED_TOKEN_GATEWAY, BridgeFungibleTokenError::UnauthorizedSender);

        let message_data = MessageData::parse(msg_idx);
        require(message_data.amount != ZERO_B256, BridgeFungibleTokenError::NoCoinsSent);

        // register a refund if tokens don't match
        if (message_data.token != BRIDGED_TOKEN) {
            register_refund(message_data.from, message_data.token, message_data.amount);
            return;
        };

        let res_amount = adjust_deposit_decimals(message_data.amount, DECIMALS, BRIDGED_TOKEN_DECIMALS);

        match res_amount {
            Result::Err(_) => {
                // register a refund if value can't be adjusted
                register_refund(message_data.from, message_data.token, message_data.amount);
            },
            Result::Ok(amount) => {
                // mint tokens & update storage
                mint(amount);
                match storage.tokens_minted.try_read() {
                    Option::Some(value) => storage.tokens_minted.write(value + amount),
                    Option::None => storage.tokens_minted.write(amount),
                };

                // when depositing to an address, msg_data.len is 160 bytes.
                // when depositing to a contract, msg_data.len is 161 bytes.
                // If msg_data.len is > 161 bytes, we must call `process_message()` on the receiving contract, forwarding the newly minted coins with the call.
                match message_data.len {
                    160 => {
                        transfer(amount, contract_id(), message_data.to);
                    },
                    161 => {
                        transfer(amount, contract_id(), message_data.to);
                    },
                    _ => {
                        if let Identity::ContractId(id) = message_data.to {
                            let dest_contract = abi(MessageReceiver, id.into());
                            dest_contract.process_message {
                                coins: amount,
                                asset_id: contract_id().value,
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

impl FungibleBridge for Contract {
    #[storage(read, write)]
    fn claim_refund(originator: b256, asset: b256) {
        let stored_amount = storage.refund_amounts.get(originator).get(asset).read();
        require(stored_amount != ZERO_B256, BridgeFungibleTokenError::NoRefundAvailable);

        // reset the refund amount to 0
        storage.refund_amounts.get(originator).insert(asset, ZERO_B256);

        // send a message to unlock this amount on the base layer gateway contract
        send_message(BRIDGED_TOKEN_GATEWAY, encode_data(originator, stored_amount, asset), 0);
    }

    #[payable]
    #[storage(read, write)]
    fn withdraw(to: b256) {
        let amount = msg_amount();
        let origin_contract_id = msg_asset_id();
        require(amount != 0, BridgeFungibleTokenError::NoCoinsSent);
        require(origin_contract_id == contract_id(), BridgeFungibleTokenError::IncorrectAssetDeposited);

        // attempt to adjust amount into base layer decimals and burn the sent tokens
        let adjusted_amount = adjust_withdrawal_decimals(amount, DECIMALS, BRIDGED_TOKEN_DECIMALS).unwrap();
        storage.tokens_minted.write(storage.tokens_minted.read() - amount);
        burn(amount);

        // send a message to unlock this amount on the base layer gateway contract
        let sender = msg_sender().unwrap();
        send_message(BRIDGED_TOKEN_GATEWAY, encode_data(to, adjusted_amount, BRIDGED_TOKEN), 0);
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
        BRIDGED_TOKEN_DECIMALS
    }

    fn bridged_token_gateway() -> b256 {
        BRIDGED_TOKEN_GATEWAY
    }
}

impl FRC20 for Contract {
    #[storage(read)]
    fn total_supply() -> U256 {
        U256::from((0, 0, 0, storage.tokens_minted.read()))
    }

    fn name() -> str[64] {
        NAME
    }

    fn symbol() -> str[32] {
        SYMBOL
    }

    fn decimals() -> u8 {
        DECIMALS
    }
}

// Storage-dependant private functions
#[storage(write)]
fn register_refund(from: b256, asset: b256, amount: b256) {
    let previous_amount = U256::from(storage.refund_amounts.get(from).get(asset).try_read().unwrap_or(ZERO_B256));
    let new_amount = U256::from(amount).add(previous_amount); // U256 has overflow checks built in;
    let new_amount_b256 = <U256 as From<b256>>::into(new_amount);

    storage.refund_amounts.get(from).insert(asset, new_amount_b256);
    log(RefundRegisteredEvent {
        from,
        asset,
        amount,
    });
}
