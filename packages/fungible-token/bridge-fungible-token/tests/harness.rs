mod utils {
    pub mod builder;
    pub mod environment;
}
use crate::env::{BridgeFungibleTokenContractConfigurables, RefundRegisteredEvent};

use std::str::FromStr;
use utils::environment as env;

use fuels::{
    accounts::ViewOnlyAccount,
    prelude::{launch_provider_and_get_wallet, Address, AssetId, CallParameters, TxParameters},
    programs::contract::SettableContract,
    tx::Receipt,
    types::Bits256,
};
use primitive_types::U256 as Unsigned256;

pub const BRIDGED_TOKEN: &str =
    "0x00000000000000000000000000000000000000000000000000000000deadbeef";
pub const BRIDGED_TOKEN_GATEWAY: &str =
    "0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe";
pub const TO: &str = "0x0000000000000000000000000000000000000000000000000000000000000777";
pub const FROM: &str = "0x0000000000000000000000008888888888888888888888888888888888888888";
pub const BRIDGED_TOKEN_DECIMALS: u8 = 18u8;
pub const PROXY_TOKEN_DECIMALS: u8 = 9u8;

mod success {
    use super::*;

    #[tokio::test]
    async fn relay_message_with_predicate_and_script_constraint() {
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        // generate the test config struct based on the decimals
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.test_amount,
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
        assert_eq!(balance, config.fuel_equivalent_amount(config.test_amount));
    }

    #[tokio::test]
    async fn depositing_max_amount_ok() {
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
    }

    #[tokio::test]
    async fn claim_refund() {
        // perform a failing deposit first to register a refund & verify it, then claim and verify output message is created as expected
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
        let call_response = test_contract
            .methods()
            .claim_refund(
                Bits256::from_hex_str(FROM).unwrap(),
                Bits256::from_hex_str(BRIDGED_TOKEN).unwrap(),
            )
            .call()
            .await
            .unwrap();

        // verify correct message was sent
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
        // the correct token fails
        let error_response = test_contract
        .methods()
        .claim_refund(
            Bits256::from_hex_str(FROM).unwrap(),
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap(),
        )
        .call()
        .await;
        assert!(error_response.is_err());

        let call_response = test_contract
            .methods()
            .claim_refund(
                Bits256::from_hex_str(FROM).unwrap(),
                Bits256::from_hex_str(wrong_token_value).unwrap(),
            )
            .call()
            .await
            .unwrap();

        // verify correct message was sent
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
    async fn depositing_amount_too_small_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS == PROXY_TOKEN_DECIMALS or BRIDGED_TOKEN_DECIMALS < PROXY_TOKEN_DECIMALS, this test will fail because it will attempt to bridge 0 coins which will always revert.
        if BRIDGED_TOKEN_DECIMALS <= PROXY_TOKEN_DECIMALS {
            return;
        }
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        // Create start test message
        let mut wallet = env::setup_wallet();
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.not_enough,
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
            Bits256(env::encode_hex(config.not_enough))
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
    }

    #[tokio::test]
    async fn depositing_amount_too_large_registers_refund() {
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow_1,
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

        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 100);

        // check that the RefundRegisteredEvent receipt is populated correctly
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow_1))
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
    }

    #[tokio::test]
    async fn depositing_amount_too_large_registers_refund_2() {
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

        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 100);

        // check that the RefundRegisteredEvent receipt is populated correctly
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
    }

    #[tokio::test]
    async fn depositing_amount_too_large_registers_refund_3() {
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow_3,
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

        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await
            .unwrap();

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 100);

        // check that the RefundRegisteredEvent receipt is populated correctly
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow_3))
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
    }

    #[tokio::test]
    async fn can_get_name() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().name().call().await.unwrap();
        assert_eq!(
            call_response.value,
            "MY_TOKEN                                                        "
        )
    }

    #[tokio::test]
    async fn can_get_symbol() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().symbol().call().await.unwrap();
        assert_eq!(call_response.value, "MYTKN                           ")
    }

    #[tokio::test]
    async fn can_get_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().decimals().call().await.unwrap();
        assert_eq!(call_response.value, PROXY_TOKEN_DECIMALS)
    }

    #[tokio::test]
    async fn can_get_bridged_token() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;
        let bridged_token = Address::from_str(BRIDGED_TOKEN).unwrap();

        let call_response = contract.methods().bridged_token().call().await.unwrap();
        assert_eq!(call_response.value, Bits256(*bridged_token))
    }

    #[tokio::test]
    async fn can_get_bridged_token_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract
            .methods()
            .bridged_token_decimals()
            .call()
            .await
            .unwrap();
        assert_eq!(call_response.value, BRIDGED_TOKEN_DECIMALS)
    }

    #[tokio::test]
    async fn can_get_bridged_token_gateway() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;
        let token_gateway = Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap();

        let call_response = contract
            .methods()
            .bridged_token_gateway()
            .call()
            .await
            .unwrap();
        assert_eq!(call_response.value, Bits256(*token_gateway))
    }

    #[tokio::test]
    async fn can_deposit_to_contract() {
        let mut wallet = env::setup_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *deposit_contract_id,
            config.max_amount,
            configurables.clone(),
            true,
            None,
        )
        .await;

        // Set up the environment
        let (_, contract_inputs, coin_inputs, message_inputs, test_contract_id, provider) =
            env::setup_environment(
                &mut wallet,
                vec![coin],
                vec![message],
                deposit_contract,
                None,
                configurables,
            )
            .await;

        let (deposit_contract, _) =
            env::get_deposit_recipient_contract_instance(wallet.clone()).await;

        // get the balance for the deposit contract before
        let deposit_contract_balance_before = provider
            .get_contract_asset_balance(
                deposit_contract.contract_id(),
                AssetId::new(*test_contract_id.hash()),
            )
            .await
            .unwrap();

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        // get the balance for the deposit contract after
        let deposit_contract_balance_after = provider
            .get_contract_asset_balance(
                deposit_contract.contract_id(),
                AssetId::new(*test_contract_id.hash()),
            )
            .await
            .unwrap();

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.max_amount)
        );
    }

    #[tokio::test]
    async fn can_deposit_to_contract_with_extra_data() {
        let mut wallet = env::setup_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *deposit_contract_id,
            config.max_amount,
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        // Set up the environment
        let (_, contract_inputs, coin_inputs, message_inputs, test_contract_id, provider) =
            env::setup_environment(
                &mut wallet,
                vec![coin],
                vec![message],
                deposit_contract,
                None,
                configurables,
            )
            .await;

        let (deposit_contract, _) =
            env::get_deposit_recipient_contract_instance(wallet.clone()).await;

        // get the balance for the deposit contract before
        let deposit_contract_balance_before = provider
            .get_contract_asset_balance(
                deposit_contract.contract_id(),
                AssetId::new(*test_contract_id.hash()),
            )
            .await
            .unwrap();

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        // get the balance for the deposit contract after
        let deposit_contract_balance_after = provider
            .get_contract_asset_balance(
                deposit_contract.contract_id(),
                AssetId::new(*test_contract_id.hash()),
            )
            .await
            .unwrap();

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.max_amount)
        );
    }
}

mod revert {
    use super::*;

    #[tokio::test]
    #[should_panic(expected = "Revert(0)")]
    async fn withdraw_fails_with_too_small_value() {
        // In cases where BRIDGED_TOKEN_DECIMALS == PROXY_TOKEN_DECIMALS or BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS, this test won't fail because it will attempt to withdraw only 1 coin.
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

    #[tokio::test]
    #[should_panic(expected = "Revert(18446744073709486080)")]
    async fn verification_fails_with_wrong_sender() {
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.min_amount,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let bad_sender: &str =
            "0x55555500000000000000000000000000000000000000000000000000005555555";

        // Set up the environment
        let (
            _test_contract,
            contract_inputs,
            coin_inputs,
            message_inputs,
            _test_contract_id,
            _provider,
        ) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            Some(bad_sender),
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
    }

    #[tokio::test]
    async fn delta_decimals_too_big_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS - PROXY_TOKEN_DECIMALS > 19,
        // there would be arithmetic overflow and possibly tokens lost.
        // We want to catch these cases early and register a refund.
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));
        let (message, coin, deposit_contract) = env::construct_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.test_amount,
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

        if BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS + 19 {
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
                Bits256(env::encode_hex(config.test_amount))
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
        }
    }

    #[tokio::test]
    async fn deposit_with_wrong_token_registers_refund() {
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let wrong_token_value: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            wrong_token_value,
            FROM,
            *Address::from_str(TO).unwrap(),
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

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 100);

        // check that the RefundRegisteredEvent receipt is populated correctly
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.min_amount))
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
    }

    #[tokio::test]
    async fn deposit_with_wrong_token_twice_registers_two_refunds() {
        let mut wallet = env::setup_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let wrong_token_value: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let config = env::generate_test_config((BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS));

        let (message, coin, deposit_contract) = env::construct_msg_data(
            wrong_token_value,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.min_amount,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let one = Unsigned256::from(1);

        let (message2,_,_) = env::construct_msg_data(
            wrong_token_value,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.min_amount + one,
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
            vec![message, message2],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs.clone(),
            &coin_inputs[..],
            &env::generate_variable_output(),
        )
        .await;

        // Relay the test message to the test contract
        let receipts_second = env::relay_message_to_contract(
            &wallet,
            message_inputs[1].clone(),
            contract_inputs.clone(),
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

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 200);


        // check that the RefundRegisteredEvent receipt is populated correctly
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.min_amount))
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

        // check that the RefundRegisteredEvent receipt is populated correctly
        let second_refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts_second)
            .unwrap();
        assert_eq!(
            second_refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.min_amount + one))
        );
        assert_eq!(
            second_refund_registered_event[0].asset,
            Bits256::from_hex_str(wrong_token_value).unwrap()
        );
        assert_eq!(
            second_refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }
}
