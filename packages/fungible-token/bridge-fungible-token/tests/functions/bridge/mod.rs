use crate::utils::environment as env;
use crate::utils::interface::bridge::withdraw;
use crate::BridgeFungibleTokenContractConfigurables;
use crate::{BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, FROM, PROXY_TOKEN_DECIMALS};

use fuels::accounts::ViewOnlyAccount;
use fuels::prelude::AssetId;
use fuels::prelude::CallParameters;
use fuels::prelude::TxParameters;
use fuels::types::Bits256;

mod success {

    use super::*;

    // TODO: clean up imports
    use crate::utils::interface::bridge::{
        bridged_token, bridged_token_decimals, bridged_token_gateway, claim_refund,
    };
    use crate::RefundRegisteredEvent;
    use crate::{launch_provider_and_get_wallet, BRIDGED_TOKEN_GATEWAY};
    use fuels::prelude::Address;
    use fuels::programs::contract::SettableContract;
    use fuels::tx::Receipt;
    use std::str::FromStr;

    #[tokio::test]
    async fn claims_refund() {
        // perform a failing deposit first to register a refund & verify it,
        // then claim and verify output message is created as expected
        let mut wallet = env::setup_wallet();

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow_2,
            configurables.clone(),
            false,
            None,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_inputs,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        let log_decoder = test_contract.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        // Verify the message value was received by the test contract
        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        assert_eq!(test_contract_balance, 100);
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow_2))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );

        // verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        let response = claim_refund(
            &test_contract,
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap(),
        )
        .await;

        // verify correct message was sent
        let message_receipt = response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        let (selector, to, token, amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        // Compare the value output in the message with the original value sent
        assert_eq!(amount, config.overflow_2);
    }

    #[tokio::test]
    async fn claim_refund_of_wrong_token_deposit() {
        // Send a message informing about a deposit with a random token address, different from the bridged token
        // Upon sending this message, the contract will register a refund for the deposit and random token
        // - Verify that the contract state has correctly changed: new refund record inserted for the correct amount and the random token
        // - Verify that the contract emits the correct logs
        // - Verify that the the receipt of the transaction contains a message for the L1 Portal that allows to withdraw the above mentioned deposit
        let mut wallet = env::setup_wallet();

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let wrong_token_value: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = env::construct_msg_data(
            wrong_token_value,
            FROM,
            *wallet.address().hash(),
            config.overflow_2,
            configurables.clone(),
            false,
            None,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_inputs,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        let log_decoder = test_contract.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        // Verify the message value was received by the test contract
        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        assert_eq!(test_contract_balance, 100);
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow_2))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(wrong_token_value).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );

        // verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // verify that trying to claim funds from
        // the incorrect token fails
        let error_response = test_contract
            .methods()
            .claim_refund(
                Bits256::from_hex_str(FROM).unwrap(),
                Bits256::from_hex_str(BRIDGED_TOKEN).unwrap(),
            )
            .call()
            .await;
        assert!(error_response.is_err());

        let response = claim_refund(
            &test_contract,
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(wrong_token_value).unwrap(),
        )
        .await;

        // verify correct message was sent
        let message_receipt = response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        let (selector, to, token, amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token, Bits256::from_hex_str(wrong_token_value).unwrap());

        // Compare the value output in the message with the original value sent
        assert_eq!(amount, config.overflow_2);
    }

    #[tokio::test]
    async fn withdraw_from_bridge() {
        // perform successful deposit first, verify it, then withdraw and verify balances
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.max_amount,
            configurables.clone(),
            false,
            None,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_inputs,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.max_amount));

        // Now try to withdraw
        let withdrawal_amount = config.test_amount;
        let custom_tx_params = TxParameters::new(0, 30_000_000, 0);
        let call_params = CallParameters::new(
            config.fuel_equivalent_amount(config.test_amount),
            AssetId::new(*test_contract_id.hash()),
            5000,
        );

        let call_response = test_contract
            .methods()
            .withdraw(Bits256(*wallet.address().hash()))
            .tx_params(custom_tx_params)
            .call_params(call_params)
            .expect("Call param Error")
            .call()
            .await
            .unwrap();

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        let (selector, to, token, amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        assert_eq!(amount, withdrawal_amount);
    }

    #[tokio::test]
    async fn decimal_conversions_are_correct() {
        // start with an eth amount
        // bridge it to Fuel
        // bridge it back to base layer
        // compare starting value with ending value, should be identical

        // first make a deposit
        let mut wallet = env::setup_wallet();
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.min_amount,
            configurables.clone(),
            false,
            None,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_inputs,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);
        // Check that wallet now has bridged coins

        let fuel_side_token_amount = config.fuel_equivalent_amount(config.min_amount);

        assert_eq!(balance, fuel_side_token_amount);

        // Now try to withdraw
        let custom_tx_params = TxParameters::new(0, 30_000_000, 0);
        let call_params = CallParameters::new(
            fuel_side_token_amount,
            AssetId::new(*test_contract_id.hash()),
            5000,
        );

        let call_response = test_contract
            .methods()
            .withdraw(Bits256(*wallet.address().hash()))
            .tx_params(custom_tx_params)
            .call_params(call_params)
            .expect("Call param Error")
            .call()
            .await
            .unwrap();

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        let (selector, to, token, msg_data_amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(token, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());

        // now verify that the initial amount == the final amount
        assert_eq!(msg_data_amount, config.min_amount);
    }

    #[tokio::test]
    async fn check_bridged_token() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = bridged_token(&contract).await;

        assert_eq!(
            response,
            Bits256(*Address::from_str(BRIDGED_TOKEN).unwrap())
        )
    }

    #[tokio::test]
    async fn check_bridged_token_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = bridged_token_decimals(&contract).await;

        assert_eq!(response, BRIDGED_TOKEN_DECIMALS)
    }

    #[tokio::test]
    async fn check_bridged_token_gateway() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = bridged_token_gateway(&contract).await;

        assert_eq!(
            response,
            Bits256(*Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap())
        )
    }
}

mod revert {

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
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        // perform successful deposit first, verify it, then withdraw and verify balances
        let mut wallet = env::setup_wallet();
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.max_amount,
            configurables.clone(),
            false,
            None,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_inputs,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.max_amount));

        // Now try to withdraw
        let withdrawal_amount = 999999999;
        let custom_tx_params = TxParameters::new(0, 30_000_000, 0);
        let call_params =
            CallParameters::new(withdrawal_amount, AssetId::new(*test_contract_id.hash()), 0);

        // The following withdraw should fail since it doesn't meet the minimum withdraw (underflow error)
        test_contract
            .methods()
            .withdraw(Bits256(*wallet.address().hash()))
            .tx_params(custom_tx_params)
            .call_params(call_params)
            .expect("Call param Error")
            .call()
            .await
            .unwrap();
    }
}
