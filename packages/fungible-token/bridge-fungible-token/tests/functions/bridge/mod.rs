use crate::utils::{
    constants::{
        BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_ID, FROM, PROXY_TOKEN_DECIMALS,
    },
    interface::bridge::withdraw,
    setup::{
        create_deposit_message, create_token, create_wallet, decode_hex, encode_hex,
        parse_output_message_data, relay_message_to_contract, setup_environment, wallet_balance,
        BridgeFungibleTokenContractConfigurables, BridgingConfig,
    },
};
use fuels::{prelude::AssetId, types::Bits256};

mod success {

    use super::*;

    use crate::utils::{
        constants::BRIDGED_TOKEN_GATEWAY,
        interface::{
            bridge::{bridged_token_gateway, claim_refund},
            src20::total_supply,
        },
        setup::{get_asset_id, ClaimRefundEvent, RefundRegisteredEvent},
    };
    use fuels::{prelude::Address, programs::contract::SettableContract, tx::Receipt, types::U256};
    use primitive_types::H160;
    use std::str::FromStr;

    #[tokio::test]
    async fn claims_refund_amount_overflow() {
        // perform a failing deposit first to register a refund & verify it,
        // then claim and verify output message is created as expected
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let deposit_amount = U256::from(u64::MAX) + U256::from(1u64);
        let token_address = format!(
            "0x{}",
            hex::encode([vec![0u8; 12], H160::random().to_fixed_bytes().to_vec()].concat())
        );

        let (message, coin, deposit_contract) = create_deposit_message(
            &token_address,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            deposit_amount,
            BRIDGED_TOKEN_DECIMALS,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let balance =
            wallet_balance(&wallet, &get_asset_id(bridge.contract_id(), &token_address)).await;

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(deposit_amount))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(&token_address).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );

        let response = claim_refund(
            &bridge,
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(&token_address).unwrap(),
            Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap(),
        )
        .await;

        // Verify correct message was sent
        let message_receipt = response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let claim_event = bridge
            .log_decoder()
            .decode_logs_with_type::<ClaimRefundEvent>(&response.receipts)
            .unwrap();

        assert_eq!(claim_event[0].amount, deposit_amount);
        assert_eq!(claim_event[0].from, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(
            claim_event[0].token_address,
            Bits256::from_hex_str(&token_address).unwrap()
        );
        assert_eq!(
            claim_event[0].token_id,
            Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap()
        );

        assert_eq!(
            *bridge.contract_id().hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 132);

        // message data
        let (selector, to, token, amount, token_id) =
            parse_output_message_data(message_receipt.data().unwrap());

        assert_eq!(selector, decode_hex("0x64a7fad9").to_vec());
        assert_eq!(to, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token, Bits256::from_hex_str(&token_address).unwrap());
        assert_eq!(token_id, Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap());

        // Compare the value output in the message with the original value sent
        assert_eq!(amount, deposit_amount);
    }

    #[tokio::test]
    async fn claims_refund_supply_overflow() {
        // perform a failing deposit first to register a refund & verify it,
        // then claim and verify output message is created as expected
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let token_address = format!(
            "0x{}",
            hex::encode([vec![0u8; 12], H160::random().to_fixed_bytes().to_vec()].concat())
        );
        let deposit_amount = U256::from(1);

        let (topping_message, coin, deposit_contract) = create_deposit_message(
            &token_address,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(u64::MAX),
            BRIDGED_TOKEN_DECIMALS,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (refundable_message, _, _) = create_deposit_message(
            &token_address,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            deposit_amount,
            BRIDGED_TOKEN_DECIMALS,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![topping_message, refundable_message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(deposit_amount))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(&token_address).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );

        let response = claim_refund(
            &bridge,
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(&token_address).unwrap(),
            Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap(),
        )
        .await;

        // Verify correct message was sent
        let message_receipt = response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let claim_event = bridge
            .log_decoder()
            .decode_logs_with_type::<ClaimRefundEvent>(&response.receipts)
            .unwrap();

        assert_eq!(claim_event[0].amount, deposit_amount);
        assert_eq!(claim_event[0].from, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(
            claim_event[0].token_address,
            Bits256::from_hex_str(&token_address).unwrap()
        );
        assert_eq!(
            claim_event[0].token_id,
            Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap()
        );

        assert_eq!(
            *bridge.contract_id().hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 132);

        // message data
        let (selector, to, token, amount, token_id) =
            parse_output_message_data(message_receipt.data().unwrap());

        assert_eq!(selector, decode_hex("0x64a7fad9").to_vec());
        assert_eq!(to, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token, Bits256::from_hex_str(&token_address).unwrap());
        assert_eq!(token_id, Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap());

        // Compare the value output in the message with the original value sent
        assert_eq!(amount, deposit_amount);
    }

    #[tokio::test]
    async fn withdraw_from_bridge_18_decimals() {
        // perform successful deposit first, verify it, then withdraw and verify balances
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let amount = 10u64;

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(amount),
            BRIDGED_TOKEN_DECIMALS,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let tx_status = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status");

        match tx_status.clone() {
            fuels::types::tx_status::TxStatus::Success { .. } => {
                // Do nothing
            }
            _ => {
                panic!("Transaction did not succeed")
            }
        }

        let balance =
            wallet_balance(&wallet, &get_asset_id(bridge.contract_id(), BRIDGED_TOKEN)).await;

        // Check that wallet now has bridged coins
        assert_eq!(balance, amount);

        // Now try to withdraw
        let gas = 200_000;
        let to = Bits256(*wallet.address().hash());

        let call_response = withdraw(&bridge, to, amount, gas).await;

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let (selector, to, token, amount, token_id) =
            parse_output_message_data(message_receipt.data().unwrap());

        assert_eq!(
            *bridge.contract_id().hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 132);

        // message data
        assert_eq!(selector, decode_hex("0x64a7fad9").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        assert_eq!(token_id, Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap());
        assert_eq!(amount, amount);

        // Check that supply has decreased by withdrawal_amount
        let supply = total_supply(&bridge, get_asset_id(bridge.contract_id(), BRIDGED_TOKEN))
            .await
            .unwrap();
        assert_eq!(supply, 0);
    }

    #[tokio::test]
    async fn check_bridged_token_gateway() {
        let contract = create_token().await;

        let response = bridged_token_gateway(&contract).await;

        assert_eq!(
            response,
            Bits256(*Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap())
        )
    }
}

mod revert {
    use std::str::FromStr;

    use super::*;

    #[tokio::test]
    #[should_panic(expected = "AssetNotFound")]
    async fn asset_to_sub_id_reverts_with_wrong_token() {
        // Try to get a sub_id for an unknown asset
        // - Verify that it reverts with an AssetNotFound error
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_asset_id: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.two,
            BRIDGED_TOKEN_DECIMALS,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, _) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        bridge
            .methods()
            .asset_to_sub_id(AssetId::from_str(incorrect_asset_id).unwrap())
            .call()
            .await
            .unwrap();
    }

    #[tokio::test]
    #[should_panic(expected = "NoRefundAvailable")]
    async fn claim_refund_fails_with_wrong_token_address() {
        // Send a message informing about a deposit with a random token address, different from the bridged token
        // Upon sending this message, the contract will register a refund for the deposit and random token
        // - Verify that trying to withdraw a completely different asset results in a NoRefundAvailable error
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_token: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";
        let wrong_token: &str =
            "0x2222220000000000000000000000000000000000000000000000000000222222";

        let (message, coin, deposit_contract) = create_deposit_message(
            incorrect_token,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.two,
            BRIDGED_TOKEN_DECIMALS,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        bridge
            .methods()
            .claim_refund(
                Bits256::from_hex_str(FROM).unwrap(),
                Bits256::from_hex_str(wrong_token).unwrap(),
                Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap(),
            )
            .call()
            .await
            .unwrap();
    }
}
