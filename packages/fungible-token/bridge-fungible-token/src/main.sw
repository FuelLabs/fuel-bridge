contract;

mod data_structures;
mod errors;
mod events;
mod interface;
mod utils;

use contract_message_receiver::MessageReceiver;
use errors::BridgeFungibleTokenError;
use data_structures::{
    constants::{DEPOSIT, CONTRACT_DEPOSIT, CONTRACT_DEPOSIT_WITH_DATA},
    message_data::MessageData,
    metadata_message::MetadataMessage,
    deposit_message::{DepositType, DepositMessage},
};
use events::{ClaimRefundEvent, DepositEvent, RefundRegisteredEvent, WithdrawalEvent, MetadataEvent};
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
    storage::{
        storage_string::*,
    },
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
const ZERO_U256 = 0x00u256;

configurable {
    DECIMALS: u64 = 9u64,
    BRIDGED_TOKEN_GATEWAY: b256 = 0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe,
}

storage {
    asset_to_sub_id: StorageMap<AssetId, SubId> = StorageMap {},
    asset_to_token_id: StorageMap<AssetId, b256> = StorageMap {},
    refund_amounts: StorageMap<b256, StorageMap<b256, u256>> = StorageMap {},
    tokens_minted: StorageMap<AssetId, u64> = StorageMap {},
    l1_addresses: StorageMap<AssetId, b256> = StorageMap {},
    l1_symbols: StorageMap<b256, StorageString> = StorageMap {},
    l1_names: StorageMap<b256, StorageString> = StorageMap {},
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

        match MessageData::parse(msg_idx) {
            MessageData::Deposit(deposit) => _process_deposit(deposit, msg_idx),
            MessageData::Metadata(metadata) => _process_metadata(metadata),
        };
    }
}

impl Bridge for Contract {
    #[storage(read, write)]
    fn claim_refund(from: b256, token_address: b256, token_id: b256) {
        let asset = sha256((token_address, token_id));
        let amount = storage.refund_amounts.get(from).get(asset).try_read().unwrap_or(ZERO_U256);
        require(
            amount != ZERO_U256,
            BridgeFungibleTokenError::NoRefundAvailable,
        );

        // reset the refund amount to 0
        storage.refund_amounts.get(from).insert(asset, ZERO_U256);

        // send a message to unlock this amount on the base layer gateway contract
        send_message(
            BRIDGED_TOKEN_GATEWAY,
            encode_data(from, amount.as_b256(), token_address, token_id),
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
        let token_id = _asset_to_token_id(asset_id);
        require(amount != 0, BridgeFungibleTokenError::NoCoinsSent);

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
            encode_data(
                to,
                amount.as_u256().as_b256(),
                storage
                    .l1_addresses
                    .get(asset_id)
                    .read(),
                token_id,
            ),
            0,
        );
        log(WithdrawalEvent {
            to: to,
            from: sender,
            amount: amount,
        });
    }

    fn bridged_token_gateway() -> b256 {
        BRIDGED_TOKEN_GATEWAY
    }

    #[storage(read)]
    fn asset_to_sub_id(asset_id: AssetId) -> SubId {
        _asset_to_sub_id(asset_id)
    }

    #[storage(read)]
    fn asset_to_l1_address(asset_id: AssetId) -> b256 {
        _asset_to_l1_address(asset_id)
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
        let l1_address = _asset_to_l1_address(asset);
        storage.l1_names.get(l1_address).read_slice()
    }

    #[storage(read)]
    fn symbol(asset: AssetId) -> Option<String> {
        let l1_address = _asset_to_l1_address(asset);
        storage.l1_symbols.get(l1_address).read_slice()
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

    let previous_amount = storage.refund_amounts.get(from).get(asset).try_read().unwrap_or(ZERO_U256);
    let new_amount = amount.as_u256() + previous_amount;

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

#[storage(read)]
fn _asset_to_token_id(asset_id: AssetId) -> b256 {
    let token_id = storage.asset_to_token_id.get(asset_id).try_read();
    require(token_id.is_some(), BridgeFungibleTokenError::AssetNotFound);
    token_id.unwrap()
}

#[storage(read)]
fn _asset_to_l1_address(asset_id: AssetId) -> b256 {
    let l1_address = storage.l1_addresses.get(asset_id).try_read();
    require(l1_address.is_some(), BridgeFungibleTokenError::AssetNotFound);
    l1_address.unwrap()
}

#[storage(read, write)]
fn _process_deposit(message_data: DepositMessage, msg_idx: u64) {
    require(
        message_data
            .amount != ZERO_B256,
        BridgeFungibleTokenError::NoCoinsSent,
    );

    let amount: u64 = 
        match <u64 as TryFrom<u256>>::try_from(message_data.amount.as_u256()) {
            Some(value) => value,
            None => {
                register_refund(message_data.from, message_data.token_address, message_data.token_id, message_data.amount);
                return;
            }
        };
    let sub_id = _generate_sub_id_from_metadata(message_data.token_address, message_data.token_id);
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
    

    // Store asset metadata if it is the first time that funds are bridged
    if storage.asset_to_sub_id.get(asset_id).try_read().is_none()
    {
        storage.asset_to_sub_id.insert(asset_id, sub_id);
        storage.asset_to_token_id.insert(asset_id, message_data.token_id);
        storage
            .total_assets
            .write(storage.total_assets.try_read().unwrap_or(0) + 1);
        storage
            .l1_addresses
            .insert(asset_id, message_data.token_address);
    };
    // mint tokens & update storage
    mint(sub_id, amount);

    match message_data.deposit_type {
        DepositType::Addr | DepositType::Contract => {
            transfer(message_data.to, asset_id, amount)
        },
        DepositType::ContractWithData => {
            let dest_contract = abi(MessageReceiver, message_data.to.as_contract_id().unwrap().into());
            dest_contract
                .process_message {
                    coins: amount,
                    asset_id: asset_id.into(),
                }(msg_idx);
        }
    };

    log(DepositEvent {
        to: message_data.to,
        from: message_data.from,
        amount: amount,
    });
}

#[storage(read, write)]
fn _process_metadata(metadata: MetadataMessage) {

    let sub_id = _generate_sub_id_from_metadata(metadata.token_address, metadata.token_id);
    let asset_id = AssetId::new(contract_id(), sub_id);

    // Important to note: in order to register metadata for an asset, 
    // it must have been deposited first
    let l1_address = _asset_to_l1_address(asset_id);

    storage.l1_names.get(l1_address).write_slice(metadata.name);
    storage.l1_symbols.get(l1_address).write_slice(metadata.symbol);

    log(MetadataEvent {
        token_address: metadata.token_address
    });
}

fn _generate_sub_id_from_metadata(token_address: b256, token_id: b256) -> b256 {
    sha256((token_address, token_id))
}