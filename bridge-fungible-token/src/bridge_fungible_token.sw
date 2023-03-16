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
    inputs::input_message_sender,
    message::send_message,
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
    parse_message_data,
};

// Storage declarations
storage {
    refund_amounts: StorageMap<(b256, b256), b256> = StorageMap {},
}

// Configurable Consts
configurable {
    DECIMALS: u8 = 9u8,
    BRIDGED_TOKEN_DECIMALS: u8 = 18u8,
    BRIDGED_TOKEN_GATEWAY: b256 = 0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe,
    BRIDGED_TOKEN: b256 = 0x00000000000000000000000000000000000000000000000000000000deadbeef,
    NAME: str[32] = "________________________MY_TOKEN",
    SYMBOL: str[32] = "___________________________MYTKN",
}

// ABI Implementations
// Implement the process_message function required to be a message receiver
impl MessageReceiver for Contract {
    #[storage(read, write)]
    #[payable]
    fn process_message(msg_idx: u8) {
        let input_sender = input_message_sender(1);
        require(input_sender.value == BRIDGED_TOKEN_GATEWAY, BridgeFungibleTokenError::UnauthorizedSender);
        let message_data = parse_message_data(msg_idx);
        require(message_data.amount != ZERO_B256, BridgeFungibleTokenError::NoCoinsSent);

        // register a refund if tokens don't match
        if (message_data.token != BRIDGED_TOKEN) {
            register_refund(message_data.from, message_data.token, message_data.amount);
            return;
        };

        let res_amount = adjust_deposit_decimals(message_data.amount, DECIMALS, BRIDGED_TOKEN_DECIMALS);
        match res_amount {
            Result::Err(e) => {
                // register a refund if value can't be adjusted
                register_refund(message_data.from, message_data.token, message_data.amount);
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
        let stored_amount = storage.refund_amounts.get((originator, asset)).unwrap();
        require(stored_amount != ZERO_B256, BridgeFungibleTokenError::NoRefundAvailable);

        // reset the refund amount to 0
        storage.refund_amounts.insert((originator, asset), ZERO_B256);

        // send a message to unlock this amount on the base layer gateway contract
        send_message(BRIDGED_TOKEN_GATEWAY, encode_data(originator, stored_amount, BRIDGED_TOKEN), 0);
    }

    #[payable]
    fn withdraw(to: b256) {
        let amount = msg_amount();
        let origin_contract_id = msg_asset_id();
        require(amount != 0, BridgeFungibleTokenError::NoCoinsSent);
        require(origin_contract_id == contract_id(), BridgeFungibleTokenError::IncorrectAssetDeposited);

        // attempt to adjust amount into base layer decimals and burn the sent tokens
        let adjusted_amount = adjust_withdrawal_decimals(amount, DECIMALS, BRIDGED_TOKEN_DECIMALS).unwrap();
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

    fn name() -> str[32] {
        NAME
    }

    fn symbol() -> str[32] {
        SYMBOL
    }

    fn decimals() -> u8 {
        DECIMALS
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

// Storage-dependant private functions
#[storage(write)]
fn register_refund(from: b256, asset: b256, amount: b256) {
    storage.refund_amounts.insert((from, asset), amount);
    log(RefundRegisteredEvent {
        from,
        asset,
        amount,
    });
}
