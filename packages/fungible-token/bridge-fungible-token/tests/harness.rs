mod functions;
mod utils;

use crate::env::{BridgeFungibleTokenContractConfigurables, RefundRegisteredEvent};

use std::str::FromStr;
use utils::environment as env;
use utils::environment::{contract_balance, wallet_balance, TestConfig};

use fuels::{
    accounts::ViewOnlyAccount,
    prelude::{Address, AssetId, CallParameters, TxParameters},
    programs::contract::SettableContract,
    types::Bits256,
};
use primitive_types::U256 as Unsigned256;

use crate::utils::constants::{
    BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_GATEWAY, FROM, PROXY_TOKEN_DECIMALS, TO,
};

mod success {
    use super::*;

    #[tokio::test]
    async fn relay_message_with_predicate_and_script_constraint() {
        let mut wallet = env::create_wallet();

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 100);
        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.test_amount));
    }

    #[tokio::test]
    async fn depositing_max_amount_ok() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 100);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.max_amount));
    }

    #[tokio::test]
    async fn depositing_amount_too_small_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS == PROXY_TOKEN_DECIMALS or BRIDGED_TOKEN_DECIMALS < PROXY_TOKEN_DECIMALS, this test will fail because it will attempt to bridge 0 coins which will always revert.
        if BRIDGED_TOKEN_DECIMALS <= PROXY_TOKEN_DECIMALS {
            return;
        }
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        // Create start test message
        let mut wallet = env::create_wallet();
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let log_decoder = token.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        // Verify the message value was received by the test contract
        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        assert_eq!(token_balance, 100);
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
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let log_decoder = token.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 100);

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
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let log_decoder = token.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 100);

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
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let log_decoder = token.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 100);

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
    async fn can_deposit_to_contract() {
        let mut wallet = env::create_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
                &mut wallet,
                vec![coin],
                vec![message],
                deposit_contract,
                None,
                configurables,
            )
            .await;

        let deposit_contract = env::create_recipient_contract(wallet.clone()).await;

        // get the balance for the deposit contract before
        let deposit_contract_balance_before = contract_balance(
            provider.clone(),
            &deposit_contract.contract_id(),
            AssetId::new(*token.contract_id().hash()),
        )
        .await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
        )
        .await;

        // get the balance for the deposit contract after
        let deposit_contract_balance_after = contract_balance(
            provider,
            &deposit_contract.contract_id(),
            AssetId::new(*token.contract_id().hash()),
        )
        .await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.max_amount)
        );
    }

    #[tokio::test]
    async fn can_deposit_to_contract_with_extra_data() {
        let mut wallet = env::create_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
                &mut wallet,
                vec![coin],
                vec![message],
                deposit_contract,
                None,
                configurables,
            )
            .await;

        let deposit_contract = env::create_recipient_contract(wallet.clone()).await;

        // get the balance for the deposit contract before
        let deposit_contract_balance_before = contract_balance(
            provider.clone(),
            &deposit_contract.contract_id(),
            AssetId::new(*token.contract_id().hash()),
        )
        .await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_inputs,
            &coin_inputs[..],
        )
        .await;

        // get the balance for the deposit contract after
        let deposit_contract_balance_after = contract_balance(
            provider,
            &deposit_contract.contract_id(),
            AssetId::new(*token.contract_id().hash()),
        )
        .await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.max_amount)
        );
    }
}

mod revert {
    use super::*;

    #[tokio::test]
    #[should_panic(expected = "Revert(18446744073709486080)")]
    async fn verification_fails_with_wrong_sender() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (_test_contract, contract_inputs, coin_inputs, message_inputs, _provider) =
            env::setup_environment(
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
        )
        .await;
    }

    #[tokio::test]
    async fn delta_decimals_too_big_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS - PROXY_TOKEN_DECIMALS > 19,
        // there would be arithmetic overflow and possibly tokens lost.
        // We want to catch these cases early and register a refund.
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        if BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS + 19 {
            let log_decoder = token.log_decoder();
            let refund_registered_event = log_decoder
                .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
                .unwrap();

            // Verify the message value was received by the test contract
            let token_balance =
                contract_balance(provider, &token.contract_id(), AssetId::default()).await;

            let balance = wallet_balance(&wallet, &token.contract_id()).await;

            assert_eq!(token_balance, 100);

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
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let wrong_token_value: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        let log_decoder = token.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        // Verify the message value was received by the test contract
        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 100);

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
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let wrong_token_value: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
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

        let (message2, _, _) = env::create_msg_data(
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
        let (token, contract_inputs, coin_inputs, message_inputs, provider) =
            env::setup_environment(
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
        )
        .await;

        // Relay the test message to the test contract
        let receipts_second = env::relay_message_to_contract(
            &wallet,
            message_inputs[1].clone(),
            contract_inputs.clone(),
            &coin_inputs[..],
        )
        .await;

        let log_decoder = token.log_decoder();
        let refund_registered_event = log_decoder
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        // Verify the message value was received by the test contract
        let token_balance =
            contract_balance(provider, &token.contract_id(), AssetId::default()).await;

        let balance = wallet_balance(&wallet, &token.contract_id()).await;

        // Verify the message value was received by the test contract
        assert_eq!(token_balance, 200);

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
