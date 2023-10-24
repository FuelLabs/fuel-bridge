use crate::utils::{
    constants::{
        BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_ID, FROM, PROXY_TOKEN_DECIMALS, TO,
    },
    setup::{
        create_msg_data, create_wallet, relay_message_to_contract, setup_environment,
        BridgeFungibleTokenContractConfigurables, BridgingConfig,
    },
};
use fuels::prelude::Address;
use std::str::FromStr;

mod success {
    use super::*;

    use crate::utils::setup::get_asset_id;
    use crate::utils::{
        constants::MESSAGE_AMOUNT,
        setup::{
            contract_balance, create_recipient_contract, encode_hex, precalculate_deposit_id,
            wallet_balance, RefundRegisteredEvent,
        },
    };
    use fuels::{prelude::AssetId, programs::contract::SettableContract, types::Bits256};
    use primitive_types::U256 as Unsigned256;

    #[tokio::test]
    async fn deposit_to_wallet() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
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

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    #[tokio::test]
    async fn deposit_to_wallet_max_amount() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
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
    }

    #[tokio::test]
    async fn deposit_to_contract() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.test,
            configurables.clone(),
            true,
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

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.test)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.max,
            configurables.clone(),
            true,
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

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.max)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_with_extra_data() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.test,
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
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

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.test)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount_with_extra_data() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.max,
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
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

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

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

        if BRIDGED_TOKEN_DECIMALS <= PROXY_TOKEN_DECIMALS {
            return;
        }

        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.not_enough,
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
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

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

        // Check the logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.amount.not_enough))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_1() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.one,
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
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

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
            Bits256(encode_hex(config.overflow.one))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_2() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
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
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

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
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_3() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.three,
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
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

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
            Bits256(encode_hex(config.overflow.three))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
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
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
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

        // Relay the test message to the bride contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

        // TODO: fails when conditional is removed
        if BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS + 19 {
            let refund_registered_event = bridge
                .log_decoder()
                .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
                .unwrap();

            let token_balance =
                contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
            let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

            // Verify the message value was received by the bridge contract
            assert_eq!(token_balance, MESSAGE_AMOUNT);

            // Verify that no tokens were minted for message.data.to
            assert_eq!(balance, 0);

            // Check logs
            assert_eq!(
                refund_registered_event[0].amount,
                Bits256(encode_hex(config.amount.test))
            );
            assert_eq!(
                refund_registered_event[0].token_address,
                Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
            );
            assert_eq!(
                refund_registered_event[0].from,
                Bits256::from_hex_str(FROM).unwrap()
            );
        }
    }

    #[tokio::test]
    async fn deposit_with_incorrect_token_registers_refund() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_token: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = create_msg_data(
            incorrect_token,
            BRIDGED_TOKEN_ID,
            FROM,
            *Address::from_str(TO).unwrap(),
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
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let token_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(token_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.amount.min))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(incorrect_token).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_with_incorrect_token_twice_registers_two_refunds() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let incorrect_token: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin, deposit_contract) = create_msg_data(
            incorrect_token,
            BRIDGED_TOKEN_ID,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let one = Unsigned256::from(1);

        let (message2, _, _) = create_msg_data(
            incorrect_token,
            BRIDGED_TOKEN_ID,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min + one,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs, provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message, message2],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

        // Relay the second test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
            &utxo_inputs.coin[..],
        )
        .await;

        let receipts_second = wallet.provider().unwrap().tx_status(&tx_id).await.expect("Could not obtain transaction status").take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();
        let second_refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts_second)
            .unwrap();

        let token_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value were received by the bridge contract
        assert_eq!(token_balance, MESSAGE_AMOUNT * 2);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.amount.min))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(incorrect_token).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
        assert_eq!(
            second_refund_registered_event[0].amount,
            Bits256(encode_hex(config.amount.min + one))
        );
        assert_eq!(
            second_refund_registered_event[0].token_address,
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
    async fn verification_fails_with_incorrect_sender() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let bad_sender: &str =
            "0x55555500000000000000000000000000000000000000000000000000005555555";

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (_test_contract, utxo_inputs, _provider) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            Some(bad_sender),
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        let receipt = wallet.provider().unwrap().tx_status(&tx_id).await.unwrap();

        seems like reverts no longer panic, so we gotta check the reason in the receipt
        dbg!(receipt);
    }
}
