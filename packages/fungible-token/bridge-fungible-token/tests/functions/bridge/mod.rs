use crate::utils::{
    constants::{
        BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, FROM, MESSAGE_AMOUNT, PROXY_TOKEN_DECIMALS,
    },
    interface::bridge::withdraw,
    setup::{
        contract_balance, create_msg_data, create_token, create_wallet, decode_hex, encode_hex,
        parse_output_message_data, relay_message_to_contract, setup_environment, wallet_balance,
        BridgeFungibleTokenContractConfigurables, BridgingConfig,
    },
};
use fuels::{accounts::ViewOnlyAccount, prelude::AssetId, types::Bits256};

mod success {

    use super::*;

    use crate::utils::{
        constants::BRIDGED_TOKEN_GATEWAY,
        interface::bridge::{
            bridged_token, bridged_token_decimals, bridged_token_gateway, claim_refund,
        },
        setup::RefundRegisteredEvent,
    };
    use fuels::{prelude::Address, programs::contract::SettableContract, tx::Receipt};
    use std::str::FromStr;
    use crate::utils::setup::get_asset_id;

    #[tokio::test]
    async fn claims_refund() {
        // perform a failing deposit first to register a refund & verify it,
        // then claim and verify output message is created as expected
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow.two,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        println!("receipts: {:#?}", receipts);

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.overflow.two))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );

        let response = claim_refund(
            &bridge,
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap(),
        )
        .await;

        // Verify correct message was sent
        let message_receipt = response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *bridge.contract_id().hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 100);

        // message data
        let (selector, to, token, amount) =
            parse_output_message_data(message_receipt.data().unwrap());

        assert_eq!(selector, decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());

        // Compare the value output in the message with the original value sent
        assert_eq!(amount, config.overflow.two);
    }

    #[tokio::test]
    async fn claim_refund_of_wrong_token_deposit() {
        // Send a message informing about a deposit with a random token address, different from the bridged token
        // Upon sending this message, the contract will register a refund for the deposit and random token
        // - Verify that the contract state has correctly changed: new refund record inserted for the correct amount and the random token
        // - Verify that the contract emits the correct logs
        // - Verify that the the receipt of the transaction contains a message for the L1 Portal that allows to withdraw the above mentioned deposit
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_token: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = create_msg_data(
            incorrect_token,
            FROM,
            *wallet.address().hash(),
            config.overflow.two,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.overflow.two))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(incorrect_token).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );

        // verify that trying to claim funds from the incorrect token fails
        let error_response = bridge
            .methods()
            .claim_refund(
                Bits256::from_hex_str(FROM).unwrap(),
                Bits256::from_hex_str(BRIDGED_TOKEN).unwrap(),
            )
            .call()
            .await;
        assert!(error_response.is_err());

        let response = claim_refund(
            &bridge,
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(incorrect_token).unwrap(),
        )
        .await;

        // verify correct message was sent
        let message_receipt = response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let (selector, to, token_bits, amount) =
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
        assert_eq!(message_receipt.len().unwrap(), 100);

        // message data
        assert_eq!(selector, decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token_bits, Bits256::from_hex_str(incorrect_token).unwrap());

        // Compare the value output in the message with the original value sent
        assert_eq!(amount, config.overflow.two);
    }

    #[tokio::test]
    async fn withdraw_from_bridge() {
        // perform successful deposit first, verify it, then withdraw and verify balances
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.amount.max,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.max));

        // Now try to withdraw
        let withdrawal_amount = config.fuel_equivalent_amount(config.amount.test);
        let gas = 5000;
        let to = Bits256(*wallet.address().hash());

        let call_response = withdraw(&bridge, to, withdrawal_amount, gas).await;

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let (selector, to, token, amount) =
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
        assert_eq!(message_receipt.len().unwrap(), 100);

        // message data
        assert_eq!(selector, decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        assert_eq!(amount, config.amount.test);
    }

    #[tokio::test]
    async fn decimal_conversions_are_correct() {
        // start with an eth amount
        // bridge it to Fuel
        // bridge it back to base layer
        // compare starting value with ending value, should be identical

        // first make a deposit
        let mut wallet = create_wallet();
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.amount.min,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        let fuel_side_token_amount = config.fuel_equivalent_amount(config.amount.min);

        assert_eq!(balance, fuel_side_token_amount);

        // Now try to withdraw
        let withdrawal_amount = fuel_side_token_amount;
        let gas = 5000;
        let to = Bits256(*wallet.address().hash());

        let call_response = withdraw(&bridge, to, withdrawal_amount, gas).await;

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let (selector, to, token, msg_data_amount) =
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
        assert_eq!(message_receipt.len().unwrap(), 100);

        // message data
        assert_eq!(selector, decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());

        // now verify that the initial amount == the final amount
        assert_eq!(msg_data_amount, config.amount.min);
    }

    #[tokio::test]
    async fn check_bridged_token() {
        let contract = create_token().await;

        let response = bridged_token(&contract).await;

        assert_eq!(
            response,
            Bits256(*Address::from_str(BRIDGED_TOKEN).unwrap())
        )
    }

    #[tokio::test]
    async fn check_bridged_token_decimals() {
        let contract = create_token().await;

        let response = bridged_token_decimals(&contract).await;

        assert_eq!(response, BRIDGED_TOKEN_DECIMALS)
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
    use crate::utils::setup::get_asset_id;
    use super::*;

    #[tokio::test]
    #[should_panic(expected = "Revert(0)")]
    async fn withdraw_fails_with_too_small_value() {
        // In cases where BRIDGED_TOKEN_DECIMALS == PROXY_TOKEN_DECIMALS or
        // BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS,
        // this test won't fail because it will attempt to withdraw only 1 coin.
        if BRIDGED_TOKEN_DECIMALS >= PROXY_TOKEN_DECIMALS {
            panic!("Revert(0)");
        }

        // perform successful deposit first, verify it, then withdraw and verify balances
        let mut wallet = create_wallet();
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.amount.max,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.max));

        // Now try to withdraw
        let withdrawal_amount = 999999999;
        let gas = 0;
        let to = Bits256(*wallet.address().hash());

        // The following withdraw should fail since it doesn't meet the minimum withdraw (underflow error)
        withdraw(&bridge, to, withdrawal_amount, gas).await;
    }
}
