use crate::BridgeFungibleTokenContractConfigurables;
use crate::TestConfig;
use crate::BRIDGED_TOKEN;
use crate::BRIDGED_TOKEN_DECIMALS;
use crate::FROM;
use crate::PROXY_TOKEN_DECIMALS;
use crate::TO;

use fuels::prelude::Address;

mod success {
    use super::*;

    use crate::contract_balance;
    use crate::wallet_balance;
    use crate::RefundRegisteredEvent;
    use crate::Unsigned256;

    use crate::utils::constants::MESSAGE_AMOUNT;
    use crate::utils::environment as env;
    use fuels::prelude::AssetId;
    use fuels::programs::contract::SettableContract;
    use fuels::types::Bits256;

    #[tokio::test]
    async fn deposit_to_wallet() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let asset_balance =
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    #[tokio::test]
    async fn deposit_to_wallet_max_amount() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.amount.max,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let asset_balance =
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.max));
    }

    #[tokio::test]
    async fn deposit_to_contract() {
        let mut wallet = env::create_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *deposit_contract_id,
            config.amount.test,
            configurables.clone(),
            true,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let deposit_contract = env::create_recipient_contract(wallet.clone()).await;

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before = contract_balance(
            provider.clone(),
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after = contract_balance(
            provider,
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.test)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount() {
        let mut wallet = env::create_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *deposit_contract_id,
            config.amount.max,
            configurables.clone(),
            true,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let deposit_contract = env::create_recipient_contract(wallet.clone()).await;

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before = contract_balance(
            provider.clone(),
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after = contract_balance(
            provider,
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.max)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_with_extra_data() {
        let mut wallet = env::create_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *deposit_contract_id,
            config.amount.test,
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let deposit_contract = env::create_recipient_contract(wallet.clone()).await;

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before = contract_balance(
            provider.clone(),
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after = contract_balance(
            provider,
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.test)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount_with_extra_data() {
        let mut wallet = env::create_wallet();
        let deposit_contract_id = env::precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *deposit_contract_id,
            config.amount.max,
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let deposit_contract = env::create_recipient_contract(wallet.clone()).await;

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before = contract_balance(
            provider.clone(),
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after = contract_balance(
            provider,
            &deposit_contract.contract_id(),
            AssetId::new(*bridge.contract_id().hash()),
        )
        .await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.max)
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_small_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS == PROXY_TOKEN_DECIMALS or
        // BRIDGED_TOKEN_DECIMALS < PROXY_TOKEN_DECIMALS,
        // this test will fail because it will attempt to bridge 0 coins which will always revert.

        // TODO: remove check?
        if BRIDGED_TOKEN_DECIMALS <= PROXY_TOKEN_DECIMALS {
            return;
        }

        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.amount.not_enough,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = env::relay_message_to_contract(
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
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check the logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.amount.not_enough))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_1() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow.one,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = env::relay_message_to_contract(
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
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow.one))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_2() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow.two,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = env::relay_message_to_contract(
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
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow.two))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_3() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *wallet.address().hash(),
            config.overflow.three,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = env::relay_message_to_contract(
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
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.overflow.three))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
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
            config.amount.test,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bride contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // TODO: check test to enforce assertions
        if BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS + 19 {
            let refund_registered_event = bridge
                .log_decoder()
                .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
                .unwrap();

            let token_balance =
                contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
            let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

            // Verify the message value was received by the bridge contract
            assert_eq!(token_balance, MESSAGE_AMOUNT);

            // Verify that no tokens were minted for message.data.to
            assert_eq!(balance, 0);

            // Check logs
            assert_eq!(
                refund_registered_event[0].amount,
                Bits256(env::encode_hex(config.amount.test))
            );
            assert_eq!(
                refund_registered_event[0].asset,
                Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
            );
            assert_eq!(
                refund_registered_event[0].from,
                Bits256::from_hex_str(FROM).unwrap()
            );
        }
    }

    #[tokio::test]
    async fn deposit_with_wrong_token_registers_refund() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_token: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = env::create_msg_data(
            incorrect_token,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = env::relay_message_to_contract(
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

        let token_balance =
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(token_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.amount.min))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(incorrect_token).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_with_wrong_token_twice_registers_two_refunds() {
        let mut wallet = env::create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = TestConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_token: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = env::create_msg_data(
            incorrect_token,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let one = Unsigned256::from(1);

        let (message2, _, _) = env::create_msg_data(
            incorrect_token,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min + one,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message, message2],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
            &utxo_inputs.coin[..],
        )
        .await;

        // Relay the second test message to the bridge contract
        let receipts_second = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
            &utxo_inputs.coin[..],
        )
        .await;

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();
        let second_refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts_second)
            .unwrap();

        let token_balance =
            contract_balance(provider, &bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &bridge.contract_id()).await;

        // Verify the message value were received by the bridge contract
        assert_eq!(token_balance, MESSAGE_AMOUNT * 2);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.amount.min))
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256::from_hex_str(incorrect_token).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
        assert_eq!(
            second_refund_registered_event[0].amount,
            Bits256(env::encode_hex(config.amount.min + one))
        );
        assert_eq!(
            second_refund_registered_event[0].asset,
            Bits256::from_hex_str(incorrect_token).unwrap()
        );
        assert_eq!(
            second_refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
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
        let bad_sender: &str =
            "0x55555500000000000000000000000000000000000000000000000000005555555";

        let (message, coin, deposit_contract) = env::create_msg_data(
            BRIDGED_TOKEN,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (_test_contract, utxo_inputs, _provider) = env::setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            Some(bad_sender),
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;
    }
}
