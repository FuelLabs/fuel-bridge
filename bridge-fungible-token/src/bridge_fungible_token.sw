contract;

dep data;
dep errors;
dep events;
dep utils;

use bridge_fungible_token_abi::BridgeFungibleToken;
use contract_message_receiver::MessageReceiver;
use errors::BridgeFungibleTokenError;
use events::{DepositEvent, RefundRegisteredEvent, WithdrawalEvent};
use std::{
    auth::{
        msg_sender,
    },
    call_frames::{
        contract_id,
        msg_asset_id,
    },
    constants::ZERO_B256,
    context::msg_amount,
    convert::From,
    logging::log,
    message::send_message,
    storage::StorageMap,
    token::{
        burn,
        mint_to_address,
    },
    u256::U256,
};
use utils::{
    adjust_deposit_decimals,
    adjust_withdrawal_decimals,
    compose,
    decompose,
    encode_data,
    input_message_sender,
    parse_message_data,
};

// Storage declarations
storage {
    refund_amounts: StorageMap<(b256, b256), b256> = StorageMap {},
}

// Storage-dependant private functions
#[storage(read, write)]
fn register_refund(from: b256, asset: b256, amount: b256) {
    storage.refund_amounts.insert((from, asset), amount);
    log(RefundRegisteredEvent {
        from,
        asset,
        amount,
    });
}

// ABI Implementations
// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[storage(read, write)]
    fn process_message(msg_idx: u8) {
        let input_sender = input_message_sender(1);
        require(input_sender.value == LAYER_1_ERC20_GATEWAY, BridgeFungibleTokenError::UnauthorizedSender);
        let message_data = parse_message_data(msg_idx);
        require(message_data.amount != ZERO_B256, BridgeFungibleTokenError::NoCoinsSent);

        // Register a refund if tokens don't match, or if delta decimals is too large
        if (message_data.l1_asset != LAYER_1_TOKEN)
            || (LAYER_1_DECIMALS - DECIMALS > 19u8)
        {
            register_refund(message_data.from, message_data.l1_asset, message_data.amount);
            return;
        };
        let res_amount = adjust_deposit_decimals(message_data.amount);
        match res_amount {
            Result::Err(e) => {
                // Register a refund if value can't be adjusted
                register_refund(message_data.from, message_data.l1_asset, message_data.amount);
            },
            Result::Ok(a) => {
                mint_to_address(a, message_data.to);
                log(DepositEvent {
                    to: message_data.to,
                    from: message_data.from,
                    amount: a,
                });
            }
        }
    }
}
impl BridgeFungibleToken for Contract {
    #[storage(read, write)]
    fn claim_refund(originator: b256, asset: b256) {
        let stored_amount = storage.refund_amounts.get((originator, asset));
        require(stored_amount != ZERO_B256, BridgeFungibleTokenError::NoRefundAvailable);

        // reset the refund amount to 0
        storage.refund_amounts.insert((originator, asset), ZERO_B256);

        // send a message to unlock this amount on the ethereum (L1) bridge contract
        send_message(LAYER_1_ERC20_GATEWAY, encode_data(originator, stored_amount), 0);
    }
    fn withdraw_to(to: b256) {
        let amount = msg_amount();
        require(amount != 0, BridgeFungibleTokenError::NoCoinsSent);
        let origin_contract_id = msg_asset_id();
        let sender = msg_sender().unwrap();

        // check that the correct asset was sent with call
        require(contract_id() == origin_contract_id, BridgeFungibleTokenError::IncorrectAssetDeposited);
        burn(amount);
        let adjusted_amount = adjust_withdrawal_decimals(amount);
        send_message(LAYER_1_ERC20_GATEWAY, encode_data(to, adjusted_amount), 0);
        log(WithdrawalEvent {
            to: to,
            from: sender,
            amount: amount,
        });
    }
    fn name() -> str[32] {
        NAME
    }
    fn symbol() -> str[32] {
        SYMBOL
    }
    fn decimals() -> u8 {
        DECIMALS
    }
    fn layer1_token() -> b256 {
        LAYER_1_TOKEN
    }
    fn layer1_decimals() -> u8 {
        LAYER_1_DECIMALS
    }
}
